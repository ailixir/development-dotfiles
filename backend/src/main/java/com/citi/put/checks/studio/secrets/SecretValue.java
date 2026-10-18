package com.citi.put.checks.studio.secrets;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import java.util.Arrays;
import java.util.Objects;

/** Owned ephemeral secret buffer; neither diagnostics nor accidental bean access reveals it. */
public final class SecretValue implements AutoCloseable {
  @com.fasterxml.jackson.annotation.JsonIgnore private final char[] value;
  @com.fasterxml.jackson.annotation.JsonIgnore private boolean erased;

  /** Takes ownership of the caller's buffer, including responsibility for erasure. */
  public SecretValue(char[] value) {
    this.value = Objects.requireNonNull(value);
  }

  public int length() {
    return value.length;
  }

  /** Compares transient artifact literals without constructing a secret String. */
  public boolean matches(String candidate) {
    if (erased || candidate == null || candidate.length() != value.length) {
      return false;
    }
    int difference = 0;
    for (int i = 0; i < value.length; i++) {
      difference |= value[i] ^ candidate.charAt(i);
    }
    return difference == 0;
  }

  @Override
  public String toString() {
    return "<secret>";
  }

  @Override
  public void close() {
    Arrays.fill(value, '\0');
    erased = true;
  }

  /** The sole secret-bearing JSON writer. Always erases, including generator failures. */
  public static final class Writer extends JsonSerializer<SecretValue> {
    @Override
    public void serialize(SecretValue secret, JsonGenerator generator, SerializerProvider provider)
        throws IOException {
      if (secret.erased) {
        throw new IOException("Secret buffer was already erased");
      }
      try {
        generator.writeString(secret.value, 0, secret.value.length);
      } finally {
        secret.close();
      }
    }
  }
}
