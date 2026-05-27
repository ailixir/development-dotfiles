package com.citi.put.checks.reports.mail;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "spring.mail.host")
public class ReportMailSender {

  private static final Logger LOG = LoggerFactory.getLogger(ReportMailSender.class);
  private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ISO_LOCAL_DATE;

  private final JavaMailSender mailSender;
  private final String fromAddress;

  public ReportMailSender(
      JavaMailSender mailSender,
      @Value("${checks.reports.mail.from:put-checks-noreply@citi.com}") String fromAddress) {
    this.mailSender = mailSender;
    this.fromAddress = fromAddress;
  }

  public SendResult send(String reportName, String html, String[] recipients) {
    String subject = "[PUT Checks] %s — %s".formatted(reportName, DATE_FMT.format(LocalDate.now()));
    int sent = 0;
    int failed = 0;
    List<String> failedRecipients = new ArrayList<>();

    for (String recipient : recipients) {
      try {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
        helper.setFrom(fromAddress);
        helper.setTo(recipient);
        helper.setSubject(subject);
        helper.setText(html, true);
        mailSender.send(message);
        sent++;
      } catch (MessagingException | RuntimeException e) {
        LOG.warn("Failed to send report '{}' to {}: {}", reportName, recipient, e.getMessage());
        failed++;
        failedRecipients.add(recipient);
      }
    }

    LOG.info("Report '{}' sent: {}/{} recipients succeeded", reportName, sent, sent + failed);
    return new SendResult(sent, failed, failedRecipients);
  }
}
