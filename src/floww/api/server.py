"""Main FastAPI application for Floww API."""

from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from structlog import get_logger
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from floww.api import __version__
from floww.monitoring import MetricsMiddleware
from floww.api.database import init_db
from floww.api.models import User, UserRole
from floww.api.routes import archive, auth, crawl, documents, graph, projects, websocket
from floww.api.schemas import HealthResponse
from floww.core.config import get_settings

settings = get_settings()
logger = get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting Floww API", version=__version__)
    
    # Initialize database
    await init_db()
    
    # Create default admin user if not exists
    from floww.api.database import async_session_factory
    from floww.api.auth import hash_password
    
    async with async_session_factory() as db:
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.email == "admin@floww.dev"))
        admin = result.scalar_one_or_none()
        
        if not admin:
            admin = User(
                email="admin@floww.dev",
                username="admin",
                hashed_password=hash_password("admin123"[:72]),  # Truncate to 72 bytes for bcrypt
                full_name="Admin",
                role=UserRole.ADMIN,
                is_superuser=True,
            )
            db.add(admin)
            await db.commit()
            logger.info("Created default admin user", email="admin@floww.dev")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Floww API")


# Create FastAPI app
app = FastAPI(
    title="Floww API",
    description="API for Autonomous SaaS Documentation Generator",
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(MetricsMiddleware)


# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception", error=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Health check
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with actual dependency verification."""
    dependencies = {}
    status = "healthy"
    
    # Check database
    try:
        from floww.api.database import async_session_factory
        async with async_session_factory() as db:
            from sqlalchemy import text
            await db.execute(text("SELECT 1"))
        dependencies["database"] = "ok"
    except Exception as e:
        dependencies["database"] = f"error: {str(e)}"
        status = "degraded"
    
    # Check Redis if configured
    if settings.redis_url:
        try:
            import redis.asyncio as redis
            r = redis.from_url(settings.redis_url)
            await r.ping()
            await r.close()
            dependencies["redis"] = "ok"
        except Exception as e:
            dependencies["redis"] = f"error: {str(e)}"
            status = "degraded"
    
    return HealthResponse(
        status=status,
        version=__version__,
        database=dependencies.get("database", "unknown"),
        timestamp=datetime.utcnow(),
    )


# Kubernetes probes
@app.get("/healthz")
async def liveness_probe():
    """Kubernetes liveness probe - check if process is alive."""
    return {"status": "alive"}


@app.get("/readyz")
async def readiness_probe():
    """Kubernetes readiness probe - check if can serve traffic."""
    try:
        from floww.api.database import async_session_factory
        async with async_session_factory() as db:
            from sqlalchemy import text
            await db.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database not ready")


# Prometheus metrics endpoint
@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )


# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(crawl.router, prefix="/api/v1")
app.include_router(graph.router, prefix="/api/v1")
app.include_router(archive.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(websocket.router, prefix="/api/v1/ws")


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Floww API",
        "version": __version__,
        "docs": "/docs",
    }


def run_server(host: str = "0.0.0.0", port: int = 8000, reload: bool = False):
    """Run the API server."""
    import uvicorn
    uvicorn.run(
        "floww.api.server:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


if __name__ == "__main__":
    run_server()
