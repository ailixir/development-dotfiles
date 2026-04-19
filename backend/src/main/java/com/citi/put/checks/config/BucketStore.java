package com.citi.put.checks.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.concurrent.TimeUnit;

public class BucketStore {

  private final Cache<String, TokenBucket> buckets;
  private final RateLimitClassifier classifier;
  private final RateLimitProperties props;

  public BucketStore(RateLimitClassifier classifier, RateLimitProperties props) {
    this.classifier = classifier;
    this.props = props;
    this.buckets =
        Caffeine.newBuilder()
            .expireAfterAccess(2, TimeUnit.MINUTES)
            .maximumSize(props.maxBuckets())
            .build();
  }

  public TokenBucket.ConsumeResult tryConsume(
      String userId,
      RateLimitClassifier.BucketClass bucketClass,
      boolean isAdmin,
      long tokensToConsume) {
    TokenBucket bucket = resolve(userId, bucketClass, isAdmin);
    return bucket.tryConsume(tokensToConsume);
  }

  public int capacityFor(RateLimitClassifier.BucketClass bucketClass, boolean isAdmin) {
    int base = classifier.capacityFor(bucketClass, props);
    return isAdmin ? base * props.adminMultiplier() : base;
  }

  private TokenBucket resolve(
      String userId, RateLimitClassifier.BucketClass bucketClass, boolean isAdmin) {
    String key = userId + ":" + bucketClass.name() + (isAdmin ? ":admin" : "");
    return buckets.get(key, k -> createBucket(bucketClass, isAdmin));
  }

  private TokenBucket createBucket(RateLimitClassifier.BucketClass bucketClass, boolean isAdmin) {
    int capacity = capacityFor(bucketClass, isAdmin);
    long refillPeriodNanos = TimeUnit.MINUTES.toNanos(1);
    return new TokenBucket(capacity, refillPeriodNanos);
  }

  static class TokenBucket {
    private final long capacity;
    private final long refillPeriodNanos;
    private double availableTokens;
    private long lastRefillTimestamp;

    TokenBucket(long capacity, long refillPeriodNanos) {
      this.capacity = capacity;
      this.refillPeriodNanos = refillPeriodNanos;
      this.availableTokens = capacity;
      this.lastRefillTimestamp = System.nanoTime();
    }

    synchronized ConsumeResult tryConsume(long tokens) {
      refill();
      if (availableTokens >= tokens) {
        availableTokens -= tokens;
        return new ConsumeResult(true, (long) availableTokens, 0);
      }
      double deficit = tokens - availableTokens;
      long waitNanos = (long) (deficit / capacity * refillPeriodNanos);
      return new ConsumeResult(false, 0, waitNanos);
    }

    private void refill() {
      long now = System.nanoTime();
      long elapsed = now - lastRefillTimestamp;
      double tokensToAdd = (double) elapsed / refillPeriodNanos * capacity;
      if (tokensToAdd >= 1.0) {
        availableTokens = Math.min(capacity, availableTokens + tokensToAdd);
        lastRefillTimestamp = now;
      }
    }

    record ConsumeResult(boolean consumed, long remaining, long waitNanos) {}
  }
}
