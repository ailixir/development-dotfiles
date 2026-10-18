package com.citi.put.checks.studio.validation;

import com.citi.put.checks.studio.dto.StudioVariable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks a draft's variable references against its declared variables (Studio v1 WP6, plan ADD-7).
 *
 * <p>Source lines reference variables as {@code <var NAME>} and secrets as {@code <secret ID>}
 * (architecture §4.3). A {@code secretRef} declaration is matched by its {@code secretId}, falling
 * back to its name.
 *
 * <p>Three findings make a draft invalid:
 *
 * <ul>
 *   <li><b>undeclared</b> — a line references a name the draft does not declare with that kind;
 *   <li><b>unvalued</b> — a referenced plain variable has no value on the draft and none was
 *       supplied by the caller;
 *   <li><b>conflicting</b> — one name is declared both as a variable and as a secret.
 * </ul>
 *
 * <p>Declared-but-unreferenced names are reported as {@code unused} and do not invalidate. Secret
 * <em>values</em> are never checked or read here: whether a vault holds the id is decided at
 * dispatch, and a secret value never travels on this path (§9.2).
 */
public final class VariableReferenceValidator {

  private static final Pattern VARIABLE_TOKEN = Pattern.compile("<var\\s+([A-Za-z0-9_.-]{1,64})>");
  private static final Pattern SECRET_TOKEN = Pattern.compile("<secret\\s+([A-Za-z0-9_.-]{1,64})>");

  private VariableReferenceValidator() {}

  /**
   * The outcome. Names are listed in first-reference (or declaration) order.
   *
   * @param undeclared references with no matching declaration, as their source tokens
   * @param unvalued referenced plain variables with no value available
   * @param conflicting names declared both as a variable and as a secret
   * @param unused declared names no line references
   */
  public record Result(
      List<String> undeclared,
      List<String> unvalued,
      List<String> conflicting,
      List<String> unused) {

    public boolean isValid() {
      return undeclared.isEmpty() && unvalued.isEmpty() && conflicting.isEmpty();
    }

    /** Everything a run would lack, for a caller that shows one list. */
    public List<String> missing() {
      List<String> missing = new ArrayList<>(undeclared);
      missing.addAll(unvalued);
      return List.copyOf(missing);
    }
  }

  /**
   * @param steps the draft's source lines
   * @param declared the draft's declared variables
   * @param supplied values the caller supplies by name; may be empty, never read beyond presence
   */
  public static Result validate(
      List<String> steps, List<StudioVariable> declared, Map<String, ?> supplied) {
    Set<String> referencedVariables = new LinkedHashSet<>();
    Set<String> referencedSecrets = new LinkedHashSet<>();
    for (String step : steps == null ? List.<String>of() : steps) {
      if (step != null) {
        collect(VARIABLE_TOKEN, step, referencedVariables);
        collect(SECRET_TOKEN, step, referencedSecrets);
      }
    }

    Map<String, String> plainValues = new LinkedHashMap<>();
    Set<String> secretIds = new LinkedHashSet<>();
    for (StudioVariable variable : declared == null ? List.<StudioVariable>of() : declared) {
      if (variable == null) {
        continue;
      }
      if (StudioVariable.KIND_SECRET_REF.equals(variable.kind())) {
        String id = variable.secretId();
        if (id != null) {
          secretIds.add(id);
        }
      } else if (variable.name() != null) {
        plainValues.put(variable.name(), variable.value());
      }
    }

    List<String> undeclared = new ArrayList<>();
    List<String> unvalued = new ArrayList<>();
    for (String name : referencedVariables) {
      if (!plainValues.containsKey(name)) {
        undeclared.add("<var " + name + ">");
      } else if (plainValues.get(name) == null && !isSupplied(supplied, name)) {
        unvalued.add(name);
      }
    }
    for (String id : referencedSecrets) {
      if (!secretIds.contains(id)) {
        undeclared.add("<secret " + id + ">");
      }
    }

    List<String> conflicting = new ArrayList<>();
    for (String name : plainValues.keySet()) {
      if (secretIds.contains(name)) {
        conflicting.add(name);
      }
    }

    List<String> unused = new ArrayList<>();
    for (String name : plainValues.keySet()) {
      if (!referencedVariables.contains(name)) {
        unused.add(name);
      }
    }
    for (String id : secretIds) {
      if (!referencedSecrets.contains(id)) {
        unused.add(id);
      }
    }

    return new Result(
        List.copyOf(undeclared),
        List.copyOf(unvalued),
        List.copyOf(conflicting),
        List.copyOf(unused));
  }

  /** The {@code <var NAME>} names one source line mentions, in first-mention order. */
  public static Set<String> variableTokens(String text) {
    Set<String> names = new LinkedHashSet<>();
    collect(VARIABLE_TOKEN, text, names);
    return names;
  }

  /** The {@code <secret ID>} ids one source line mentions, in first-mention order. */
  public static Set<String> secretTokens(String text) {
    Set<String> ids = new LinkedHashSet<>();
    collect(SECRET_TOKEN, text, ids);
    return ids;
  }

  private static void collect(Pattern pattern, String text, Set<String> into) {
    Matcher matcher = pattern.matcher(text);
    while (matcher.find()) {
      into.add(matcher.group(1));
    }
  }

  private static boolean isSupplied(Map<String, ?> supplied, String name) {
    if (supplied == null) {
      return false;
    }
    Object value = supplied.get(name);
    return value != null && !(value instanceof String text && text.isBlank());
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}
