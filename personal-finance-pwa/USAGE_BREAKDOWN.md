# 📊 Usage & Cost Breakdown - Detailed Analysis

## Understanding the Numbers

The usage calculations are for your **ENTIRE APP** with all users combined, not per user.

---

## Detailed Breakdown (50 Users Total)

### Scenario: 50 users, 15-minute notification interval

---

## 1. Netlify Functions

### How It Works:
- Cron job triggers `send-reminders` function every 15 minutes
- Function runs once and checks ALL users in a single execution
- Each execution = 1 function call

### Calculation:
```
Triggers per hour: 60 min ÷ 15 min = 4 calls/hour
Calls per day: 4 × 24 = 96 calls/day
Calls per month: 96 × 30 = 2,880 calls/month

Additional calls (user actions):
- register-token: ~50 calls (one-time per user)
- update-preferences: ~100 calls/month (users changing settings)
- unregister-token: ~20 calls/month (users disabling)

Total: ~3,050 calls/month
```

**Free Tier:** 125,000 calls/month  
**Your Usage:** ~3,050 calls/month (2.4% of free tier)  
**Cost:** $0

---

## 2. Firebase Cloud Messaging (FCM)

### How It Works:
- Each notification sent to a device = 1 FCM message
- If 10 users are due for notification, that's 10 FCM messages

### Calculation:
```
Assuming average 60-minute interval per user:

Notifications per user per day: 24 hours ÷ 1 hour = 24 notifications
Total notifications per day: 24 × 50 users = 1,200 notifications/day
Total per month: 1,200 × 30 = 36,000 notifications/month
```

**Free Tier:** Unlimited  
**Your Usage:** ~36,000 messages/month  
**Cost:** $0

---

## 3. Firestore Database

### How It Works:
- Each `send-reminders` execution reads ALL user documents
- Each notification sent = 1 write (update lastNotifiedAt)

### Reads:
```
Function runs: 96 times/day
Users per run: 50 users
Total reads: 96 × 50 = 4,800 reads/day
Monthly reads: 4,800 × 30 = 144,000 reads/month
```

### Writes:
```
Notifications sent per day: ~1,200 (varies by user intervals)
Monthly writes: 1,200 × 30 = 36,000 writes/month

Additional writes:
- User registration: ~50 writes (one-time)
- Preference updates: ~100 writes/month
- Total: ~36,150 writes/month
```

### Storage:
```
Per user document: ~1 KB
50 users: 50 KB
Total storage: ~50 KB
```

**Free Tier:**
- Reads: 50,000/day (1.5M/month)
- Writes: 20,000/day (600K/month)
- Storage: 1 GB

**Your Usage:**
- Reads: 144,000/month (9.6% of free tier)
- Writes: 36,150/month (6% of free tier)
- Storage: 50 KB (0.005% of free tier)

**Cost:** $0

---

## 4. Cron-job.org

### How It Works:
- Triggers your Netlify function every 15 minutes
- 1 HTTP request per trigger

### Calculation:
```
Triggers per hour: 4
Triggers per day: 96
Triggers per month: 2,880
```

**Free Tier:** 60 requests/hour  
**Your Usage:** 4 requests/hour (6.7% of free tier)  
**Cost:** $0

---

## Summary Table (50 Users)

| Service | Metric | Free Tier | Your Usage | % Used | Cost |
|---------|--------|-----------|------------|--------|------|
| **Netlify Functions** | Calls/month | 125,000 | 3,050 | 2.4% | $0 |
| **FCM** | Messages/month | Unlimited | 36,000 | N/A | $0 |
| **Firestore Reads** | Reads/month | 1,500,000 | 144,000 | 9.6% | $0 |
| **Firestore Writes** | Writes/month | 600,000 | 36,150 | 6% | $0 |
| **Firestore Storage** | Storage | 1 GB | 50 KB | 0.005% | $0 |
| **Cron-job.org** | Requests/hour | 60 | 4 | 6.7% | $0 |

**Total Monthly Cost: $0** 🎉

---

## Scaling Analysis

### What if you grow to 500 users?

| Service | 50 Users | 500 Users | 5,000 Users | Free Tier | Still Free? |
|---------|----------|-----------|-------------|-----------|-------------|
| **Netlify Functions** | 3,050 | 3,050 | 3,050 | 125,000 | ✅ Yes |
| **FCM Messages** | 36,000 | 360,000 | 3,600,000 | Unlimited | ✅ Yes |
| **Firestore Reads** | 144,000 | 1,440,000 | 14,400,000 | 1,500,000/mo | ⚠️ 500 users OK, 5K needs paid |
| **Firestore Writes** | 36,150 | 361,500 | 3,615,000 | 600,000/mo | ⚠️ 500 users OK, 5K needs paid |
| **Storage** | 50 KB | 500 KB | 5 MB | 1 GB | ✅ Yes |
| **Cron-job.org** | 4/hour | 4/hour | 4/hour | 60/hour | ✅ Yes |

### Key Insight:
**Netlify Functions usage doesn't increase with users!** 🎯

The function runs once every 15 minutes and checks all users in a single execution. Whether you have 50 or 5,000 users, it's still just 96 function calls per day.

---

## Cost Projections

### 50 Users (Current)
- **Cost:** $0/month
- **Status:** Well within all free tiers

### 500 Users
- **Cost:** $0/month
- **Status:** Still within free tiers
- **Firestore reads:** 96% of free tier (close but OK)

### 5,000 Users
- **Firestore reads:** 14.4M/month (exceeds free tier)
- **Firestore writes:** 3.6M/month (exceeds free tier)
- **Estimated cost:** ~$15-20/month for Firestore
- **Everything else:** Still free!

### 50,000 Users
- **Firestore:** ~$150-200/month
- **Netlify Functions:** Still free! (same 3,050 calls/month)
- **FCM:** Still free! (unlimited)

---

## Optimization Tips for Scaling

### If You Approach Free Tier Limits:

#### 1. Increase Notification Interval
```
Current: 60 min → 24 notifications/user/day
Change to: 120 min → 12 notifications/user/day
Result: 50% reduction in reads/writes
```

#### 2. Batch Reads More Efficiently
```
Current: Read all users every 15 min
Optimized: Read only users due for notification
Result: Significant reduction in reads
```

#### 3. Use Firestore Indexes
```
Create index on: lastNotifiedAt + intervalMinutes
Query only users where: now - lastNotifiedAt >= intervalMinutes
Result: Fewer document reads
```

#### 4. Cache User Data
```
Cache user list in memory for 5 minutes
Only query Firestore when cache expires
Result: 75% reduction in reads
```

---

## Real-World Usage Patterns

### Typical User Behavior:

**Active Users (30%):**
- Enable notifications
- Check app daily
- Receive 24 notifications/day

**Moderate Users (50%):**
- Enable notifications
- Check app 2-3 times/week
- Receive 24 notifications/day

**Inactive Users (20%):**
- Disable notifications or uninstall
- No notifications sent

### Adjusted Calculation (50 users):
```
Active (15 users): 15 × 24 = 360 notifications/day
Moderate (25 users): 25 × 24 = 600 notifications/day
Inactive (10 users): 0 notifications/day

Total: 960 notifications/day (not 1,200)
Monthly: 28,800 notifications (not 36,000)
```

**Result:** Even lower usage than estimated! ✅

---

## Monitoring Your Usage

### Firebase Console
1. Go to Firebase Console
2. Navigate to **Usage and billing**
3. Check:
   - Firestore reads/writes
   - Storage usage
   - FCM messages sent

### Netlify Dashboard
1. Go to Netlify Dashboard
2. Navigate to **Analytics** → **Functions**
3. Check:
   - Function invocations
   - Execution time
   - Error rate

### Set Up Alerts
Both Firebase and Netlify allow you to set usage alerts:
- Firebase: 80% of free tier
- Netlify: 80% of free tier

---

## Cost Comparison with Alternatives

### Your FCM Setup (50 users):
- **Cost:** $0/month
- **Reliability:** High
- **Scalability:** Up to 500 users free

### Alternative: OneSignal (Free Tier):
- **Cost:** $0/month for 10,000 subscribers
- **Limitations:** Branding, limited features
- **Your setup is better:** More control, no branding

### Alternative: Pusher (Paid):
- **Cost:** $49/month for 500 users
- **Your setup saves:** $588/year!

### Alternative: Custom Server:
- **Cost:** $5-10/month (VPS)
- **Maintenance:** High
- **Your setup is better:** Serverless, no maintenance

---

## Bottom Line

### For 50 Users:
- ✅ **100% Free**
- ✅ All services well within free tiers
- ✅ No credit card required
- ✅ No surprise charges

### For Growth:
- ✅ Free up to ~500 users
- ✅ After 500 users: ~$15-20/month (still very cheap!)
- ✅ Scales automatically
- ✅ No infrastructure management

### Key Advantage:
**Netlify Functions cost doesn't increase with users!** The function runs once and checks all users, so whether you have 50 or 50,000 users, it's the same number of function calls.

---

## FAQ

### Q: Does each user cost me money?
**A:** No! The function runs once every 15 minutes and checks all users. Adding users doesn't increase function calls.

### Q: What increases with more users?
**A:** Only Firestore reads/writes and FCM messages. But these are very cheap and have generous free tiers.

### Q: When will I need to pay?
**A:** Around 500-1,000 users, you might exceed Firestore free tier. Cost would be ~$15-20/month.

### Q: Can I reduce costs?
**A:** Yes! Increase notification interval (60 min → 120 min) to cut usage in half.

### Q: Is this cheaper than alternatives?
**A:** Yes! Most push notification services charge $50-100/month for 500 users. You'll pay $0-20.

---

**Summary:** Your current setup with 50 users costs **$0/month** and will remain free even as you grow to 500 users! 🎉
