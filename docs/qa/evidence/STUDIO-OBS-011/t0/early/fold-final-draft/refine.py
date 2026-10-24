from pathlib import Path
OUT=Path(__file__).parent;FINAL=OUT/'final-candidates';base='backend/src/main/java/com/citi/put/checks/studio/'
p=FINAL/(base+'dispatch/HttpRunnerDispatchClient.java');s=p.read_text();s=s.replace('  private URI validationOrigin;', '  private URI validationOrigin;\n  private boolean explicitValidationOrigin;')
s=s.replace('    this.validationOrigin = runner != null && runner.isConfigured() ? URI.create(runner.baseUrl()) : null;\n','')
s=s.replace('''    URI endpoint = validationOrigin == null ? null : validationOrigin.resolve("/v2/validate-observed");''','''    URI validationOrigin = explicitValidationOrigin ? this.validationOrigin
        : runner != null && runner.isConfigured() ? URI.create(runner.baseUrl()) : null;
    URI endpoint = validationOrigin == null ? null : validationOrigin.resolve("/v2/validate-observed");''')
s=s.replace('    this.validationOrigin = origin;\n    this.validationClient = client;', '    this.validationOrigin = origin;\n    this.explicitValidationOrigin = true;\n    this.validationClient = client;')
p.write_text(s)
print('Preserved lazy public dispatch-constructor origin parsing; explicit validation setup still uses identical original origin/token/client')
