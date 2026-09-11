package com.citi.put.checks.studio.dispatch;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The declared references of one confirmed revision, <b>typed</b> (§4.5, §8.3, contract {@code
 * ReferenceDeclarations}).
 *
 * <p>Story 10.8 already separates {@code plain} from {@code secretRef} when it writes {@code
 * {"variables": [...], "secrets": [...]}} onto the revision. Until story 10.17 that type was
 * destroyed one layer below, by a reader that flattened both arrays into a single {@code
 * List&lt;String&gt;} — so by the time anything downstream could act on a reference, nothing knew
 * which of them was a secret. A flat list cannot fill the contract's two resolved maps, cannot tell
 * a secret-use decision from a variable read, and cannot notice a secret id arriving among the
 * variables.
 *
 * <p>Order is declaration order and is preserved, because it is the order the author wrote and the
 * only order any assertion about "the second declared secret" could mean.
 *
 * @param variables declared {@code vars.get} names, in declaration order
 * @param secrets declared {@code vars.secret} ids, in declaration order
 */
public record ReferenceDeclarations(List<String> variables, List<String> secrets) {

  /** Nothing declared. Distinct from <em>unreadable</em>, which is terminal (AC-10). */
  public static final ReferenceDeclarations NONE = new ReferenceDeclarations(List.of(), List.of());

  public ReferenceDeclarations {
    variables = List.copyOf(variables);
    secrets = List.copyOf(secrets);
  }

  public boolean isEmpty() {
    return variables.isEmpty() && secrets.isEmpty();
  }

  /** Every declared name, variables first. Names only — there is no value in this type. */
  public List<String> allNames() {
    List<String> all = new ArrayList<>(variables.size() + secrets.size());
    all.addAll(variables);
    all.addAll(secrets);
    return List.copyOf(all);
  }

  /** A name declared as both a variable and a secret, which is a refusal wherever it is found. */
  public Set<String> crossedNames() {
    Set<String> crossed = new LinkedHashSet<>(variables);
    crossed.retainAll(Set.copyOf(secrets));
    return Set.copyOf(crossed);
  }
}
