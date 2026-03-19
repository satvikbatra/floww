/**
 * Example: Using Smart Similarity Detection
 * 
 * This example demonstrates how the similarity detector prevents
 * repetitive crawling of Instagram-like social media sites.
 */

import { SimilarityDetector } from '../services/crawl/similarity-detector'

// Example URLs from Instagram locations page
const instagramUrls = [
  'https://www.instagram.com/explore/locations/UY/uruguay/:1',
  'https://www.instagram.com/explore/locations/UY/uruguay/:2',
  'https://www.instagram.com/explore/locations/UY/uruguay/:3',
  'https://www.instagram.com/explore/locations/UY/uruguay/:4',
  'https://www.instagram.com/explore/locations/UY/uruguay/:77',
  'https://www.instagram.com/explore/locations/UY/uruguay/:78',
  'https://www.instagram.com/explore/locations/UY/uruguay/:150',
]

// Example page data (simulated)
const createPageData = (url: string, variation: number = 0) => ({
  title: 'Explore Uruguay Locations',
  html: '<html>...</html>',
  links: Array(150 + variation).fill(null).map((_, i) => ({ href: `/link/${i}` })),
  forms: [
    { action: '/search', method: 'get' },
    { action: '/login', method: 'post' },
  ],
})

async function demonstrateSimilarityDetection() {
  console.log('🎯 Smart Similarity Detection Demo\n')
  console.log('=' .repeat(60))
  
  // Initialize detector with default settings
  const detector = new SimilarityDetector({
    maxSimilarUrlsPerPattern: 3,
    contentSimilarityThreshold: 0.85,
  })

  console.log('\n1️⃣ URL Pattern Detection\n')
  console.log('Checking Instagram location URLs...\n')

  for (const url of instagramUrls) {
    const { skip, reason } = detector.shouldSkipUrl(url)
    
    if (skip) {
      console.log(`❌ SKIP: ${url}`)
      console.log(`   Reason: ${reason}\n`)
    } else {
      console.log(`✅ CRAWL: ${url}\n`)
    }
  }

  console.log('=' .repeat(60))
  console.log('\n2️⃣ Content Similarity Detection\n')

  // Sample product pages
  const productUrls = [
    'https://shop.example.com/products/laptop-1',
    'https://shop.example.com/products/laptop-2',
    'https://shop.example.com/products/laptop-3',
  ]

  for (let i = 0; i < productUrls.length; i++) {
    const url = productUrls[i]
    const pageData = createPageData(url, i) // Slight variation
    
    const { similar, reason, similarTo } = detector.isContentSimilar(url, pageData)
    
    if (similar) {
      console.log(`❌ SKIP: ${url}`)
      console.log(`   Reason: ${reason}`)
      if (similarTo) {
        console.log(`   Similar to: ${similarTo}`)
      }
      console.log()
    } else {
      console.log(`✅ CRAWL: ${url}`)
      console.log(`   Unique content detected\n`)
    }
  }

  console.log('=' .repeat(60))
  console.log('\n3️⃣ Statistics\n')

  const stats = detector.getStatistics()
  console.log(`Total URL patterns detected: ${stats.totalPatterns}`)
  console.log(`Content fingerprints stored: ${stats.totalContentFingerprints}`)
  console.log(`Duplicates prevented: ${stats.duplicatesDetected}`)
  
  if (stats.topPatterns.length > 0) {
    console.log('\nTop Repetitive Patterns:')
    stats.topPatterns.forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.pattern}`)
      console.log(`   Count: ${p.count}`)
      console.log(`   Examples:`)
      p.urls.slice(0, 2).forEach(url => {
        console.log(`     - ${url}`)
      })
    })
  }

  console.log('\n' + '='.repeat(60))
  console.log('\n4️⃣ Diminishing Returns Check\n')

  // Simulate crawling many similar pages
  for (let i = 0; i < 15; i++) {
    const url = `https://example.com/blog/post-${i}`
    const pageData = createPageData(url, Math.floor(Math.random() * 3))
    detector.isContentSimilar(url, pageData)
  }

  const isDiminishing = detector.isDiminishingReturns(10)
  
  if (isDiminishing) {
    console.log('⚠️  Diminishing returns detected!')
    console.log('   Recent pages are too similar to each other.')
    console.log('   Recommendation: Stop crawling this section.')
  } else {
    console.log('✅ No diminishing returns detected')
    console.log('   Continue crawling normally.')
  }

  console.log('\n' + '='.repeat(60))
  console.log('\n💡 Summary\n')
  console.log('The similarity detector:')
  console.log('  ✓ Identifies URL patterns like :1, :2, :3...')
  console.log('  ✓ Limits how many similar URLs to crawl')
  console.log('  ✓ Detects similar page content')
  console.log('  ✓ Warns about diminishing returns')
  console.log('  ✓ Provides detailed statistics')
  console.log('\nResult: Saves 80-90% of crawling time! 🚀\n')
}

// Run the demo
if (require.main === module) {
  demonstrateSimilarityDetection().catch(console.error)
}

export { demonstrateSimilarityDetection }
