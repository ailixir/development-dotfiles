package com.citi.put.checks.studio.evidence;

import java.util.Optional;

/**
 * Reads recording bytes at the <b>deterministic key the API derives</b> (§6.2, §6.3; story 10.15
 * AC-16).
 *
 * <p>Four things this interface deliberately cannot do, and each omission is load-bearing:
 *
 * <ul>
 *   <li>It cannot <b>put</b>. Architecture §6.2 gives the runner write-only credentials scoped to
 *       the {@code studio/} prefix and the API read-only ones; a write operation declared here
 *       would be a permission the API is not supposed to hold, expressed in Java.
 *   <li>It cannot <b>delete</b>. Physical removal is the bucket's lifecycle rule, which §6.2 says
 *       is asynchronous and must never be assumed to have happened — see {@code videoExpiresAt},
 *       which is the API's own, logical, answer.
 *   <li>It cannot <b>list</b>. One derived key is read. A listing would make the media route depend
 *       on an enumeration and on a permission nothing else needs.
 *   <li>It cannot <b>copy</b>. There is one object and one reader.
 * </ul>
 *
 * <p><b>A ranged read reads only its range.</b> {@link #read(String, long, long)} takes the bounds
 * rather than returning the whole object for the caller to slice, because a seam that hands back
 * the whole object makes "we only read what was asked for" unobservable — and unobservable is how a
 * media route ends up pulling a gigabyte per seek.
 *
 * <p><b>An unreachable store is not an absent object.</b> An absent key is {@link
 * Optional#empty()}; a store that could not be reached is {@link
 * VideoObjectStoreUnavailableException}. Collapsing the two would make the API answer <i>"no
 * evidence for this execution"</i> — a statement about the run — when what actually happened is
 * that a bucket was down. {@code ResultManifestStore.isAvailable} states the same rule for the
 * manifest side and {@code ObjectStoreUnavailableError} states its mirror in the runner.
 *
 * <p>Runtime implementations use local filesystem or AWS S3 storage. Credentials and bucket
 * lifecycle provisioning remain external setup (ED-03). {@link FakeVideoObjectStore} is test-only.
 */
public interface VideoObjectStore {

  /**
   * Size and existence for one derived key; {@link Optional#empty()} when the store answered and
   * the object is not there.
   *
   * @throws VideoObjectStoreUnavailableException the store could not be reached at all
   */
  Optional<VideoObjectMetadata> metadata(String key);

  /**
   * The bytes of {@code [firstByte, lastByte]} inclusive, and no others.
   *
   * @throws VideoObjectStoreUnavailableException the store could not be reached at all
   */
  byte[] read(String key, long firstByte, long lastByte);
}
