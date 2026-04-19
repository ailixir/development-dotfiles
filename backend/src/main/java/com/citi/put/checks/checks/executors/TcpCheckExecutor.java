package com.citi.put.checks.checks.executors;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.checks.model.TcpConfiguration;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class TcpCheckExecutor implements CheckExecutor {

  private static final Logger LOG = LoggerFactory.getLogger(TcpCheckExecutor.class);

  private final MeterRegistry meterRegistry;

  public TcpCheckExecutor(MeterRegistry meterRegistry) {
    this.meterRegistry = meterRegistry;
  }

  @Override
  public CheckType supportedType() {
    return CheckType.TCP;
  }

  @Override
  public ExecutionOutcome execute(Check check, ExecutionContext context) {
    TcpConfiguration config = (TcpConfiguration) check.getConfiguration();
    long start = System.nanoTime();

    try (Socket socket = new Socket()) {
      socket.connect(new InetSocketAddress(config.host(), config.port()), config.timeoutMs());
      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      recordMetrics(check, config, "SUCCESS", duration);
      LOG.debug(
          "TCP check {} → {}:{} connected in {}ms",
          check.getId(),
          config.host(),
          config.port(),
          duration.toMillis());
      return new ExecutionOutcome.Success(
          duration,
          "Connected to "
              + config.host()
              + ":"
              + config.port()
              + " in "
              + duration.toMillis()
              + "ms");
    } catch (SocketTimeoutException e) {
      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      recordMetrics(check, config, "TIMEOUT", duration);
      return new ExecutionOutcome.Timeout(duration);
    } catch (UnknownHostException e) {
      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      recordMetrics(check, config, "FAILURE", duration);
      return new ExecutionOutcome.Failure(
          duration, "DNS resolution failed for host: " + config.host(), null);
    } catch (IOException e) {
      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      recordMetrics(check, config, "FAILURE", duration);
      return new ExecutionOutcome.Failure(
          duration,
          "Connection failed to " + config.host() + ":" + config.port() + " — " + e.getMessage(),
          null);
    }
  }

  private void recordMetrics(
      Check check, TcpConfiguration config, String status, Duration duration) {
    Timer.builder("checks.tcp.execute.seconds")
        .tag("host", config.host())
        .tag("status", status)
        .register(meterRegistry)
        .record(duration);
    Counter.builder("checks.execution.total")
        .tag("check_type", "TCP")
        .tag("status", status)
        .tag("csi_id", check.getCsiId())
        .register(meterRegistry)
        .increment();
  }
}
