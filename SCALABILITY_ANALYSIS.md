# QR Menu System - Scalability Analysis

## Current Architecture Assessment

### ✅ **What Works Well:**
1. **Frontend (React SPA)**: Static files can handle thousands of concurrent users when served via CDN
2. **No Auto-Refresh/Polling**: TableSummary only loads data once on mount - no continuous polling that would create load
3. **Simple Database Queries**: Queries are straightforward and indexed (TableID lookups)
4. **Connection Pooling**: Already implemented for database connections

### ⚠️ **Potential Bottlenecks for 100 Concurrent Users:**

#### 1. **Database Connection Pool (CRITICAL)**
- **Current Setting**: `max: 10` connections (default)
- **Issue**: With 100 concurrent users, only 10 can query the database at once
- **Impact**: Users will experience delays or timeouts
- **Solution**: Increase pool size

#### 2. **No Response Caching**
- Menu items are fetched fresh from database on every request
- Menu data rarely changes, but every user triggers a DB query
- **Solution**: Add caching for menu endpoints

#### 3. **No Rate Limiting**
- Vulnerable to abuse or accidental DDoS
- **Solution**: Add rate limiting middleware

#### 4. **Single Backend Instance**
- All traffic goes to one server
- **Solution**: Consider load balancing for production

---

## Recommendations for 100 Concurrent Users

### **Priority 1: Increase Database Connection Pool**

**File**: `backend/config/dbConfig.js`

**Current**:
```javascript
pool: {
  max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : 10,
  min: process.env.DB_POOL_MIN ? Number(process.env.DB_POOL_MIN) : 0,
}
```

**Recommended for 100 users**:
```javascript
pool: {
  max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : 50,  // Increased from 10
  min: process.env.DB_POOL_MIN ? Number(process.env.DB_POOL_MIN) : 5,   // Keep some connections warm
  idleTimeoutMillis: 30000
}
```

**Set in `.env`**:
```env
DB_POOL_MAX=50
DB_POOL_MIN=5
```

**Why**: SQL Server can handle 50+ connections easily. This allows 50 concurrent database operations.

---

### **Priority 2: Add Response Caching for Menu Data**

Menu items don't change frequently. Cache the responses:

**Install cache package**:
```bash
npm install node-cache
```

**Add to `backend/controllers/menu.controller.js`**:
```javascript
import NodeCache from 'node-cache';
const menuCache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

export async function getGroups(_req, res, next) {
  try {
    const cacheKey = 'menu:groups';
    let data = menuCache.get(cacheKey);
    
    if (!data) {
      data = await listGroups();
      menuCache.set(cacheKey, data);
    }
    
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
}

export async function getItems(req, res, next) {
  try {
    const { page, pageSize, search, groupId, groupCode, sort } = req.query;
    
    // Only cache if no search/filter (most common case)
    const cacheKey = search || groupId || groupCode 
      ? null 
      : `menu:items:${page}:${pageSize}:${sort}`;
    
    let result = cacheKey ? menuCache.get(cacheKey) : null;
    
    if (!result) {
      result = await listMenuItems({ page, pageSize, search, groupId, groupCode, sort });
      if (cacheKey) {
        menuCache.set(cacheKey, result);
      }
    }
    
    res.json({
      ok: true,
      paging: { page: result.page, pageSize: result.pageSize, total: result.total },
      data: result.data
    });
  } catch (e) {
    next(e);
  }
}
```

**Why**: Reduces database load by 80-90% for menu browsing.

---

### **Priority 3: Add Rate Limiting**

**Install**:
```bash
npm install express-rate-limit
```

**Add to `backend/index.js`**:
```javascript
import rateLimit from 'express-rate-limit';

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  message: 'Too many requests, please try again later.'
});

// Stricter limit for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 payment requests per 15 minutes
  message: 'Too many payment requests, please try again later.'
});

app.use('/api', apiLimiter);
app.use('/api/payment', paymentLimiter);
```

**Why**: Prevents abuse and ensures fair resource usage.

---

### **Priority 4: Frontend CDN & Static Asset Optimization**

**For Production**:
1. **Use CDN** (Cloudflare, AWS CloudFront, etc.) for frontend static files
2. **Enable Gzip/Brotli compression** on server
3. **Set proper cache headers** for static assets

**Why**: Reduces server load and improves response times globally.

---

## Expected Performance with Optimizations

### **With All Optimizations:**
- ✅ **100 concurrent users**: **YES, should work smoothly**
- ✅ **200 concurrent users**: Likely OK
- ⚠️ **500+ concurrent users**: May need additional optimizations

### **Without Optimizations:**
- ⚠️ **100 concurrent users**: **May experience slowdowns** (connection pool bottleneck)
- ❌ **200+ concurrent users**: Likely to fail/timeout

---

## Monitoring Recommendations

1. **Add logging for slow queries**:
```javascript
// In dbConfig.js or middleware
const startTime = Date.now();
// ... query ...
const duration = Date.now() - startTime;
if (duration > 1000) {
  console.warn(`[SLOW QUERY] ${duration}ms: ${sqlText.substring(0, 100)}`);
}
```

2. **Monitor connection pool usage**:
```javascript
// Add endpoint to check pool status
app.get('/api/health/db', async (req, res) => {
  const pool = await connectToDb();
  res.json({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.pending
  });
});
```

3. **Use tools**: 
   - PM2 for process management
   - New Relic / Datadog for monitoring
   - SQL Server Profiler for query analysis

---

## Quick Fix Summary

**Minimum changes needed for 100 users:**

1. ✅ Increase `DB_POOL_MAX` to 50 in `.env`
2. ✅ Add menu caching (5-minute TTL)
3. ✅ Add basic rate limiting

**Estimated time**: 30-60 minutes

**Expected result**: Smooth operation for 100+ concurrent users

---

## Testing Recommendations

1. **Load Testing**: Use tools like:
   - Apache Bench (`ab`)
   - Artillery
   - k6
   - JMeter

2. **Test Scenario**:
   ```
   - 100 concurrent users
   - Each user: Scan QR → View menu → Add items → View table summary
   - Monitor: Response times, error rates, database connections
   ```

3. **Success Criteria**:
   - 95% of requests complete in < 2 seconds
   - < 1% error rate
   - Database connection pool not exhausted
   - No timeouts

---

## Conclusion

**Can 100 users use it simultaneously?**

**Current state**: ⚠️ **Maybe, but likely to have issues** (connection pool bottleneck)

**With optimizations**: ✅ **Yes, should work smoothly**

**Recommended action**: Implement Priority 1-3 optimizations before production deployment with 100+ users.

