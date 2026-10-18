"""Builds work/GuidedPublicationReplayIT.java from work/base/ + block.java.txt.

Every edit is anchored by identifier text (never by line number) and must match exactly once.
Run: python3 -I build.py   (from this work/ directory)
"""

import hashlib
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
BASE = HERE / "base" / "GuidedPublicationReplayIT.java"
OUT = HERE / "GuidedPublicationReplayIT.java"
BASE_SHA = "4242ac27020814fe57355116a06ef1271b4a0c2f247d2847ea3c28888ec55b33"

src = BASE.read_text(encoding="utf-8")
if hashlib.sha256(src.encode("utf-8")).hexdigest() != BASE_SHA:
    sys.exit("base hash mismatch")


def once(text, old, new, label):
    if text.count(old) != 1:
        sys.exit(f"{label}: anchor count {text.count(old)}")
    return text.replace(old, new)


# ---- Own block: immediately after incrementalPrefixCallbacksKeepStateAndFenceBothReservations ----
sig = "  void incrementalPrefixCallbacksKeepStateAndFenceBothReservations() throws Exception {\n"
if src.count(sig) != 1:
    sys.exit("B1a method anchor")
start = src.index(sig)
end = src.index("\n  }\n", start) + len("\n  }\n")
block = (HERE / "block.java.txt").read_text(encoding="utf-8")
src = src[:end] + block + src[end:]

# ---- Shared hunk H1: RuntimeHooks.observedOriginalSessionRepository, after the B1a branch ----
src = once(
    src,
    """                  return result;
                }
                if (observer == null
""",
    """                  return result;
                }
                if (capture == null
                    && b1Armed()
                    && !org.springframework.transaction.support.TransactionSynchronizationManager
                        .isActualTransactionActive()) {
                  // STUDIO-OBS-015 B1b-d: identical outermost execution; only an actual commit is
                  // observed (b1AfterCommit), exactly as in the B1A-CB-01 branch above.
                  boolean[] committed = {false};
                  T result =
                      super.execute(
                          status -> {
                            T value = callback.doInTransaction(status);
                            committed[0] = status.isNewTransaction() && !status.isRollbackOnly();
                            return value;
                          });
                  if (committed[0]
                      && !org.springframework.transaction.support.TransactionSynchronizationManager
                          .isActualTransactionActive()) {
                    b1AfterCommit(result);
                  }
                  return result;
                }
                if (observer == null
""",
    "H1",
)

# ---- Shared hunk H2: observedReportCapture filter, before the preReadyId capture branch ----
src = once(
    src,
    """            UUID target = preReadyId;
""",
    """            if (b1Selected(http)) { // STUDIO-OBS-015 B1b-d: inert unless a B1 parent arms it
              b1Filter(http, response, b1Request -> chain.doFilter(b1Request, response));
              return;
            }
            UUID target = preReadyId;
""",
    "H2",
)

# ---- Shared hunk H3: APP /flow handler, after its incrementalDomVariant block ----
src = once(
    src,
    """                  + "document.querySelector('output[aria-label=\\"Order reference\\"]').textContent='changed-after-read';});</script></body>");
            }
            byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
""",
    """                  + "document.querySelector('output[aria-label=\\"Order reference\\"]').textContent='changed-after-read';});</script></body>");
            }
            // STUDIO-OBS-015 B1c (b1bcd-design01 T3): inert unless a B1 parent arms a variant.
            if (b1FlowRedirect(exchange)) {
              return;
            }
            html = b1FlowPage(html);
            byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
""",
    "H3",
)

# ---- Shared hunks H4a-e: incrementalTenModel (b1bcd-design01 T4) ----
src = once(
    src,
    """        first = java.util.stream.IntStream.range(0, source.size()).filter(at -> source.get(at).path("stepId").asText().equals(id)).findFirst().orElseThrow();
      }
      var references = result.putArray("sourceReferences");
""",
    """        first = java.util.stream.IntStream.range(0, source.size()).filter(at -> source.get(at).path("stepId").asText().equals(id)).findFirst().orElseThrow();
      }
      if ("b1d-boundary-plan-fail".equals(incrementalDomVariant)
          || "b1d-empty-plan-fail".equals(incrementalDomVariant)) { // B1D-02: mixed run only
        return result.put("status", "UNSUPPORTED").put("reasonCode", "INSUFFICIENT_EVIDENCE");
      }
      var references = result.putArray("sourceReferences");
""",
    "H4a",
)
src = once(
    src,
    """        if (!literalReplacement && stepId.equals(INCREMENTAL_STEPS.get(1))) bindingConsumers.add(C.object().put("stepId", stepId).put("argumentSlot", "fill.value"));
""",
    """        if (!literalReplacement && stepId.equals(INCREMENTAL_STEPS.get(1))) bindingConsumers.add(C.object().put("stepId", stepId).put("argumentSlot", "fill.value"));
        if (!literalReplacement
            && stepId.equals(INCREMENTAL_STEPS.get(1))
            && b1StepTwoAssertion(source.get(at))) { // B1C-01 step-2 binding assertion
          bindingConsumers.add(
              C.object().put("stepId", stepId).put("argumentSlot", "assert.expected"));
        }
""",
    "H4b",
)
src = once(
    src,
    """            if (source.get(at).path("text").asText().contains("click Submit")) obligations.add(obligation(stepId, 1, "click", "Submit", null, null));
""",
    """            if (source.get(at).path("text").asText().contains("click Submit")) obligations.add(obligation(stepId, 1, "click", "Submit", null, null));
            if (b1StepTwoAssertion(source.get(at))) { // B1C-01 step-2 binding assertion
              obligations.add(
                  obligation(stepId, 1, "assert", "Order reference", null, "order")
                      .put("predicate", "containsText"));
            }
""",
    "H4c",
)
src = once(
    src,
    """          obligations.add(obligation(stepId, 1, "assert", "Confirmation", null, null).put("predicate", "visible"));
        } else {
          String target = source.get(at).path("text").asText().contains("Destination") ? "Destination" : "Confirmation";
""",
    """          obligations.add(obligation(stepId, 1, "assert", "Confirmation", null, null).put("predicate", "visible"));
        } else if (b1GuardObligation(stepId, source.get(at)) != null) { // B1C-03 guard steps
          obligations.add(b1GuardObligation(stepId, source.get(at)));
        } else {
          String target = source.get(at).path("text").asText().contains("Destination") ? "Destination" : "Confirmation";
""",
    "H4d",
)
src = once(
    src,
    """    } else if (op.equals("assert")) {
      operation.put("predicate", "visible").putNull("expected");
    }
    return result;
  }

  private static ObjectNode secretLoginModel(""",
    """    } else if (op.equals("assert")) {
      operation.put("predicate", "visible").putNull("expected");
    } else if (op.equals("press")) { // B1C-03 guard steps: the authored Enter
      operation.put("key", "Enter");
    }
    return result;
  }

  private static ObjectNode secretLoginModel(""",
    "H4e",
)

# ---- Shared hunks H5a-c: incrementalNativeFaultObserver JS (b1bcd-design01 T5) ----
src = once(
    src,
    """RevRuntime.prototype.start=async function(...args){const result=await Reflect.apply(i15Start,this,args);
""",
    """RevRuntime.prototype.start=async function(...args){b1PairEvent('START',this.context);
  const result=await Reflect.apply(i15Start,this,args);await b1HoldEmptyStart(this);
""",
    "H5a",
)
src = once(
    src,
    """RevRuntime.prototype.update=async function(...args){
  const pfx=pfxSelect(this,args[0]);
""",
    """RevRuntime.prototype.update=async function(...args){
  b1PairEvent('UPDATE_ENTER',args[0]);
  const pfx=pfxSelect(this,args[0]);
""",
    "H5b",
)
src = once(
    src,
    """  const result=await Reflect.apply(i15Update,this,args);
""",
    """  const result=await Reflect.apply(i15Update,this,args);b1PairEvent('UPDATE_ACCEPTED',args[0]);
""",
    "H5c",
)
src = once(
    src,
    """  finally{observations.invoke=originalInvoke;this.matches=originalMatches;event('DISPATCH_END');}
};
\"\"\".formatted(""",
    """  finally{observations.invoke=originalInvoke;this.matches=originalMatches;event('DISPATCH_END');}
};
// STUDIO-OBS-015 B1d (b1bcd-design01 T5): value-free context-pair facts; inert unless armed.
const b1PairControl=pfxRoot+'/obs015-prefix-sync-b1-pair-control.json',
  b1PairEvents=pfxRoot+'/obs015-prefix-sync-b1-pair-events.jsonl',b1Held=new Set();
function b1PairArmed(){try{const c=JSON.parse(fs.readFileSync(b1PairControl,'utf8'));
  return c&&c.armed===true?c:null;}catch{return null;}}
function b1PairEvent(phase,ctx){const c=b1PairArmed();if(!c)return;try{
 const has=k=>Object.prototype.hasOwnProperty.call(ctx,k);
 const row={phase,sessionHash:i15Hash(ctx.sessionId),contextRevision:ctx.contextRevision,
  materializationRevision:ctx.materializationRevision,
  hasProgram:has('prefixProgram'),hasHash:has('prefixProgramHash'),
  programActions:ctx.prefixProgram?.actions?.length??null,
  programSteps:ctx.prefixProgram?.sourceStepIds?.length??null,
  programHashValid:has('prefixProgram')&&i15Hash(ctx.prefixProgram)===ctx.prefixProgramHash,
  prefixProgramHash:ctx.prefixProgramHash??null};
 const line=Buffer.from(JSON.stringify(row)+'\\\\n','utf8');
 const size=fs.existsSync(b1PairEvents)?fs.statSync(b1PairEvents).size:0;
 if(size+line.length>65536)throw new Error('B1_PAIR_BOUND');
 fs.appendFileSync(b1PairEvents,line,{mode:0o600});
}catch{try{fs.appendFileSync(b1PairEvents,'{"phase":"ERROR"}\\\\n',{mode:0o600});}catch{}}}
// A real-start response withhold (the rebootstrap cause): the actual start already completed.
async function b1HoldEmptyStart(runtime){const c=b1PairArmed(),ctx=runtime.context;
 if(!c||!(c.holdEmptyStartMs>0)||!ctx?.prefixProgram||ctx.prefixProgram.actions.length!==0
  ||b1Held.has(ctx.sessionId))return;
 b1Held.add(ctx.sessionId);b1PairEvent('START_HELD',ctx);
 await new Promise(resolve=>setTimeout(resolve,c.holdEmptyStartMs));
 b1PairEvent('START_RELEASED',ctx);}
\"\"\".formatted(""",
    "H5d",
)

OUT.write_text(src, encoding="utf-8")
print(hashlib.sha256(src.encode("utf-8")).hexdigest(), OUT)
