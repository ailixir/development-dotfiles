package com.citi.put.checks.checks.executors;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.dc.DailyChecksAdapter;
import com.citi.put.checks.dc.DcProperties;
import com.citi.put.checks.dc.mapping.SplunkMapping;
import org.springframework.stereotype.Component;

/** Thin Splunk executor (Proposal B) — delegates shared mechanics to {@link DailyChecksAdapter}. */
@Component
public class SplunkCheckExecutor implements CheckExecutor {

  private final DailyChecksAdapter adapter;
  private final DcProperties dcProperties;

  public SplunkCheckExecutor(DailyChecksAdapter adapter, DcProperties dcProperties) {
    this.adapter = adapter;
    this.dcProperties = dcProperties;
  }

  @Override
  public CheckType supportedType() {
    return CheckType.SPLUNK;
  }

  @Override
  public ExecutionOutcome execute(Check check, ExecutionContext context) {
    return adapter.run(
        check,
        context,
        c -> SplunkMapping.toRequest(c, dcProperties),
        SplunkMapping::parseDetail);
  }
}
