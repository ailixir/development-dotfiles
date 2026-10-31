package com.citi.put.checks.studio.guided.translation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The Playwright API reference carried in the prompts (ADR-SC-008 D6), generated at build time by
 * {@code tools/build-playwright-reference.cjs} from the pinned type definitions. It is guidance for
 * the model, not an allow-list: nothing here decides whether generated code is admitted.
 */
public final class PlaywrightReference {
  /** The plan may ask for at most this many extended sections per step. */
  static final int MAX_EXTENDED = 4;

  private static final String RESOURCE = "/studio/playwright-reference/reference.txt";

  private record Section(String id, boolean core, String title, String body) {}

  private final String referenceHash;
  private final String preamble;
  private final String index;
  private final Map<String, Section> sections;

  private PlaywrightReference(
      String referenceHash, String preamble, String index, Map<String, Section> sections) {
    this.referenceHash = referenceHash;
    this.preamble = preamble;
    this.index = index;
    this.sections = sections;
  }

  public static PlaywrightReference load() {
    byte[] bytes;
    try (var in = PlaywrightReference.class.getResourceAsStream(RESOURCE)) {
      if (in == null) {
        throw new IllegalStateException("Missing Playwright reference resource");
      }
      bytes = in.readAllBytes();
    } catch (IOException error) {
      throw new IllegalStateException("Cannot read Playwright reference resource");
    }
    var preamble = new StringBuilder();
    var index = new StringBuilder();
    Map<String, Section> sections = new LinkedHashMap<>();
    StringBuilder block = null;
    String id = null;
    String title = null;
    boolean core = false;
    for (String line : new String(bytes, StandardCharsets.UTF_8).split("\n", -1)) {
      if (line.startsWith("@@")) {
        if (id != null) {
          sections.put(id, new Section(id, core, title, block.toString()));
          id = null;
        }
        if (line.equals("@@preamble")) {
          block = preamble;
        } else if (line.equals("@@index")) {
          block = index;
        } else if (line.startsWith("@@section ")) {
          String[] head = line.split(" ", 4);
          id = head[1];
          core = head[2].equals("core");
          title = head[3];
          block = new StringBuilder();
        } else {
          throw new IllegalStateException("Unknown Playwright reference block");
        }
      } else if (block != null && !line.isEmpty()) {
        block.append(line).append('\n');
      }
    }
    if (id != null) {
      sections.put(id, new Section(id, core, title, block.toString()));
    }
    if (sections.isEmpty() || index.isEmpty() || preamble.isEmpty()) {
      throw new IllegalStateException("Incomplete Playwright reference resource");
    }
    return new PlaywrightReference(
        sha256(bytes),
        preamble.toString(),
        index.toString(),
        Collections.unmodifiableMap(sections));
  }

  /** SHA-256 of the resource bytes: the pin of this reference in the run's environment record. */
  public String referenceHash() {
    return referenceHash;
  }

  /** One line per section, naming its members; the planning stage picks extended sections by id. */
  public String index() {
    return index;
  }

  public List<String> sectionIds() {
    return List.copyOf(sections.keySet());
  }

  /**
   * The core sections plus up to {@value #MAX_EXTENDED} of the requested extended sections, in file
   * order. A pick is only a hint: unknown, duplicate, core and surplus ids are ignored, so the same
   * request always yields the same bytes and a bad pick costs nothing but a missing section.
   */
  public String select(List<String> requested) {
    Set<String> chosen = new LinkedHashSet<>(validExtended(requested));
    List<String> parts = new ArrayList<>();
    parts.add(preamble);
    for (Section section : sections.values()) {
      if (section.core() || chosen.contains(section.id())) {
        parts.add("## " + section.title() + " (" + section.id() + ")\n" + section.body());
      }
    }
    return String.join("\n", parts);
  }

  /** The requested extended section ids that count: known, not core, distinct, at most four. */
  List<String> validExtended(List<String> requested) {
    Set<String> chosen = new LinkedHashSet<>();
    for (String id : requested) {
      Section section = sections.get(id);
      if (section != null && !section.core() && chosen.size() < MAX_EXTENDED) {
        chosen.add(id);
      }
    }
    return List.copyOf(chosen);
  }

  /** The size of one section's text, for the prompt-size checks. */
  int sectionBytes(String id) {
    return sections.get(id).body().getBytes(StandardCharsets.UTF_8).length;
  }

  boolean isCore(String id) {
    return sections.get(id).core();
  }

  private static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }
}
