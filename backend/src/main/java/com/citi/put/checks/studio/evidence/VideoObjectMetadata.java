package com.citi.put.checks.studio.evidence;

/**
 * What the store reports about one object: its size, measured from the object.
 *
 * <p>Deliberately not a duration. ADR-002 §17.6 rejected having the API probe the stored object's
 * duration, so nothing here parses the webm container — this record carries the one number the
 * Range protocol needs, and the route states no length it did not get from here (story 10.15
 * AC-11).
 *
 * @param sizeBytes the object's length in bytes, as the store reports it
 */
public record VideoObjectMetadata(long sizeBytes) {}
