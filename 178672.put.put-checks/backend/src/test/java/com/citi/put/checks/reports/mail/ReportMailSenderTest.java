package com.citi.put.checks.reports.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

class ReportMailSenderTest {

  private JavaMailSender javaMailSender;
  private ReportMailSender reportMailSender;

  @BeforeEach
  void setUp() {
    javaMailSender = mock(JavaMailSender.class);
    when(javaMailSender.createMimeMessage()).thenReturn(mock(MimeMessage.class));
    reportMailSender = new ReportMailSender(javaMailSender, "noreply@citi.com");
  }

  @Test
  void allRecipientsSucceed() {
    String[] recipients = {"a@citi.com", "b@citi.com", "c@citi.com"};
    SendResult result = reportMailSender.send("Daily Report", "<html></html>", recipients);

    assertThat(result.sent()).isEqualTo(3);
    assertThat(result.failed()).isEqualTo(0);
    assertThat(result.failedRecipients()).isEmpty();
    assertThat(result.allSucceeded()).isTrue();
    verify(javaMailSender, times(3)).send(any(MimeMessage.class));
  }

  @Test
  void oneRecipientFails() {
    doThrow(new MailSendException("Connection refused"))
        .doNothing()
        .doNothing()
        .when(javaMailSender)
        .send(any(MimeMessage.class));

    String[] recipients = {"bad@citi.com", "b@citi.com", "c@citi.com"};
    SendResult result = reportMailSender.send("Weekly Report", "<html></html>", recipients);

    assertThat(result.sent()).isEqualTo(2);
    assertThat(result.failed()).isEqualTo(1);
    assertThat(result.failedRecipients()).containsExactly("bad@citi.com");
    assertThat(result.allSucceeded()).isFalse();
    assertThat(result.allFailed()).isFalse();
  }

  @Test
  void allRecipientsFail() {
    doThrow(new MailSendException("SMTP down")).when(javaMailSender).send(any(MimeMessage.class));

    String[] recipients = {"a@citi.com", "b@citi.com", "c@citi.com"};
    SendResult result = reportMailSender.send("Alert Digest", "<html></html>", recipients);

    assertThat(result.sent()).isEqualTo(0);
    assertThat(result.failed()).isEqualTo(3);
    assertThat(result.failedRecipients()).hasSize(3);
    assertThat(result.allFailed()).isTrue();
  }

  @Test
  void singleRecipientSuccess() {
    String[] recipients = {"solo@citi.com"};
    SendResult result = reportMailSender.send("Solo Report", "<html></html>", recipients);

    assertThat(result.sent()).isEqualTo(1);
    assertThat(result.failed()).isEqualTo(0);
    assertThat(result.allSucceeded()).isTrue();
  }

  @Test
  void emptyRecipientsArray() {
    SendResult result = reportMailSender.send("Empty Report", "<html></html>", new String[0]);

    assertThat(result.sent()).isEqualTo(0);
    assertThat(result.failed()).isEqualTo(0);
    assertThat(result.allSucceeded()).isTrue();
  }
}
