\pset format unaligned
\pset tuples_only on
SELECT 'TABLE '||c.relname||' '||c.relkind::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY 1;
SELECT 'COL '||c.relname||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||CASE WHEN a.attnotnull THEN ' NN' ELSE '' END||COALESCE(' D='||pg_get_expr(d.adbin,d.adrelid),'')
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1;
SELECT 'CON '||c.relname||' '||k.contype::text||' '||md5(pg_get_constraintdef(k.oid))||' '||left(regexp_replace(pg_get_constraintdef(k.oid),'\s+',' ','g'),140)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT c.relispartition ORDER BY 1;
SELECT 'TRG '||c.relname||' '||t.tgname||' '||p.proname||' '||t.tgdeferrable::text||t.tginitdeferred::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND NOT c.relispartition ORDER BY 1;
SELECT 'FN '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1;
SELECT 'IDX '||c.relname||' '||regexp_replace(pg_get_indexdef(i.indexrelid),'^.* USING ','') FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT c.relispartition ORDER BY 1;
