"""Project management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from floww.api.database import get_db
from floww.api.models import Project
from floww.api.schemas import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new project - NO AUTH REQUIRED."""
    print("DEBUG: create_project called WITHOUT AUTHENTICATION!")
    project = Project(
        owner_id="bypass-auth",
        name=project_data.name,
        description=project_data.description,
        base_url=str(project_data.base_url),
        config=project_data.config.model_dump(),
    )
    
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    return project


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """List all projects for the current user."""
    # Count total projects
    count_result = await db.execute(
        select(func.count())
        .select_from(Project)
    )
    total = count_result.scalar()
    
    # Get paginated projects
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Project)
        .order_by(Project.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    projects = result.scalars().all()
    
    return ProjectListResponse(
        projects=[ProjectResponse.model_validate(p) for p in projects],
        total=total,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific project."""
    result = await db.execute(
        select(Project).where(
            Project.id == str(project_id),
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a project."""
    result = await db.execute(
        select(Project).where(
            Project.id == str(project_id),
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    
    # Update fields
    update_data = project_data.model_dump(exclude_unset=True)
    if "base_url" in update_data:
        update_data["base_url"] = str(update_data["base_url"])
    if "config" in update_data:
        update_data["config"] = update_data["config"].model_dump()
    
    for field, value in update_data.items():
        setattr(project, field, value)
    
    await db.commit()
    await db.refresh(project)
    
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a project."""
    result = await db.execute(
        select(Project).where(
            Project.id == str(project_id),
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    
    await db.delete(project)
    await db.commit()
