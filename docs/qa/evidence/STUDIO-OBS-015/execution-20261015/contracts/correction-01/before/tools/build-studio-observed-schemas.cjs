#!/usr/bin/env node
'use strict';
// The closed v3 JSON schemas are the source. This generator never edits those schemas.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'docs/specs/studio-observed-authoring/contracts/v3');
const base = 'https://checks.citi.example/contracts/observed/v3/';
const schemas = Object.fromEntries(fs.readdirSync(directory).filter(n => n.endsWith('.schema.json')).sort()
  .map(file => [file.replace('.schema.json', ''), JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))]));
for (const [name, schema] of Object.entries(schemas)) {
  if (schema.$id !== base + name + '.schema.json') throw Error('Wrong canonical schema identity: ' + name);
}
function closure(roots) {
  const result = {};
  function add(name) {
    if (result[name]) return;
    const schema = schemas[name];
    if (!schema) throw Error('Missing schema: ' + name);
    result[name] = schema;
    function visit(value) {
      if (!value || typeof value !== 'object') return;
      if (value.$ref) {
        const url = new URL(value.$ref, schema.$id);
        if (!url.href.startsWith(base)) throw Error('Foreign schema: ' + url.href);
        add(path.basename(url.pathname).replace('.schema.json', ''));
      }
      for (const child of Object.values(value)) visit(child);
    }
    visit(schema);
  }
  roots.forEach(add);
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
const pascal = name => name.replace(/(^|-)([a-z])/g, (_, prefix, letter) => letter.toUpperCase());
function generateTypes(bundle, aliases, namedDefinitions) {
  const names = new Map();
  for (const [file, schema] of Object.entries(bundle)) {
    names.set(schema.$id, aliases[file] ?? pascal(file));
    for (const definition of Object.keys(schema.definitions ?? {})) {
      names.set(schema.$id + '#/definitions/' + definition,
        namedDefinitions[file]?.[definition] ?? pascal(definition));
    }
  }
  const emitted = new Map();
  function resolve(url) {
    const [id, fragment] = url.split('#');
    const schema = Object.values(bundle).find(item => item.$id === id);
    if (!schema) throw Error('Unknown type ref: ' + url);
    return fragment ? fragment.slice(1).split('/').reduce((value, key) => value[key], schema) : schema;
  }
  function type(schema, baseId) {
    if (schema.$ref) {
      const url = new URL(schema.$ref, baseId).href;
      if (names.has(url)) { emit(url); return names.get(url); }
      return type(resolve(url), url.split('#')[0]);
    }
    if (Object.hasOwn(schema, 'const')) return JSON.stringify(schema.const);
    if (schema.enum) return schema.enum.map(JSON.stringify).join(' | ');
    if (schema.oneOf) return schema.oneOf.map(branch => '(' + type(branch, baseId) + ')').join(' | ');
    if (Array.isArray(schema.type)) return schema.type.map(t => type({...schema, type:t}, baseId)).join(' | ');
    if (schema.type === 'null') return 'null';
    if (schema.type === 'string' || schema.type === 'boolean') return schema.type;
    if (schema.type === 'integer' || schema.type === 'number') return 'number';
    if (schema.type === 'array') return 'readonly (' + type(schema.items, baseId) + ')[]';
    if (schema.type === 'object') {
      if (schema.patternProperties) {
        const valueTypes = [...new Set(Object.values(schema.patternProperties).map(value => type(value, baseId)))];
        return 'Readonly<Record<string, ' + valueTypes.join(' | ') + '>>';
      }
      return '{ ' + Object.entries(schema.properties ?? {}).map(([key, value]) =>
        'readonly ' + JSON.stringify(key) + (schema.required?.includes(key) ? '' : '?') + ': ' + type(value, baseId) + ';').join(' ') + ' }';
    }
    return 'unknown';
  }
  function emit(url) {
    const name = names.get(url);
    if (emitted.has(name)) return;
    emitted.set(name, '');
    const schema = resolve(url);
    const body = type(schema, url.split('#')[0]);
    emitted.set(name, schema.type === 'object' && !schema.oneOf && !schema.patternProperties
      ? 'export interface ' + name + ' ' + body : 'export type ' + name + ' = ' + body + ';');
  }
  for (const schema of Object.values(bundle)) {
    emit(schema.$id);
    for (const definition of Object.keys(schema.definitions ?? {})) emit(schema.$id + '#/definitions/' + definition);
  }
  return '/** Generated from closed observed v3 contracts by tools/build-studio-observed-schemas.cjs. Never edit by hand. */\n' +
    [...emitted.values()].filter(Boolean).join('\n') + '\n';
}
const guidedRoots = ['session','limits','availability','allocation','authored-inputs','bridge','runner-context','commands',
  'consumer-edge','action','source-reference','ledger','producer','assignment','assignment-receipt',
  'assignment-stop','assignment-lifecycle','observation-refresh'];
const guided = closure(guidedRoots);
const guidedNames = {bridge:'Bridge', 'consumer-edge':'ConsumerEdge'};
const guidedDefs = {
  bridge:Object.fromEntries(Object.keys(schemas.bridge.definitions).map(name => [name,'Bridge'+pascal(name)])),
  commands:Object.fromEntries(Object.keys(schemas.commands.definitions).map(name => [name,'Commands'+pascal(name)])),
};
const observedRoots = ['replay-profile','replay-operation','replay-policy','replay-artifact','replay-validation',
  'replay-job','replay-ipc','publication','revision'];
const observed = closure(observedRoots);
const aliases = {action:'GuidedAction',ledger:'GuidedLedger',observation:'ObservedPage',producer:'OriginalProducer',
  'consumer-edge':'OriginalConsumerEdge',allocation:'OriginalAllocation',binding:'HistoricalBinding',
  'learned-plan':'LearnedPlan','source-reference':'SourceReference','execution-evidence':'ExecutionEvidence',
  session:'GuidedSession','replay-profile':'Profile','replay-operation':'ReplayAction','replay-policy':'Policy4',
  'replay-artifact':'Artifact3','replay-validation':'ValidationRequest','replay-job':'ObservedJob',
  'replay-ipc':'ObservedFrame',publication:'FinalizeRequest'};
const outputs = {
  'studio-runner/src/guided/schemas.json':JSON.stringify(Object.fromEntries(Object.entries(guided).map(([k,v])=>[k+'.schema.json',v])),null,2)+'\n',
  'studio-runner/src/guided/types.ts':generateTypes(guided,guidedNames,guidedDefs),
  'studio-runner/src/validator/observedSchemas.json':JSON.stringify(observed,null,2)+'\n',
  'studio-runner/src/executor/observedOperations.ts':generateTypes(observed,aliases,{bridge:{identity:'GuidedIdentity'}}),
};
const summary = Object.keys(guided).length + ' guided schemas, ' + Object.keys(observed).length +
  ' replay schemas; four byte-identical outputs';
/** Throws unless every checked-in output equals a fresh regeneration byte for byte. */
function check() {
  for (const [file, content] of Object.entries(outputs)) {
    if (fs.readFileSync(path.join(root, file), 'utf8') !== content) throw Error('Stale generated output: ' + file);
  }
  return summary;
}
function generate() {
  for (const [file, content] of Object.entries(outputs)) fs.writeFileSync(path.join(root, file), content);
  return summary;
}
module.exports = { check, generate, outputs };
if (require.main === module) {
  const verified = process.argv.includes('--check');
  console.log((verified ? 'Verified' : 'Generated') + ' v3: ' + (verified ? check() : generate()) +
    '. Backend processResources packages the same source schemas.');
}
