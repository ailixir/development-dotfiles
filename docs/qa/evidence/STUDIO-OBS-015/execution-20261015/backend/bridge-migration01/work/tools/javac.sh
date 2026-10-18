#!/bin/bash
# usage: javac.sh <outdir> <src.java>...   (JDK 21, -proc:none; approximate classpath:
# backend build classes/resources + newest Gradle-cache jar per group/artifact; not Gradle's
# exact testCompileClasspath)
set -e
JH=/Users/brunobuger/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home
B=/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend/build
CACHE=~/.gradle/caches/modules-2/files-2.1
CP=$B/classes/java/main:$B/classes/java/test:$B/resources/main:$B/resources/test
for d in $CACHE/*/*; do
  v=$(ls -1 "$d" 2>/dev/null | sort -V | tail -1)
  for j in "$d/$v"/*/*.jar; do
    case "$j" in *-sources.jar|*-javadoc.jar) ;; *) [ -f "$j" ] && CP=$CP:$j ;; esac
  done
done
OUT=$1; shift
mkdir -p "$OUT"
"$JH/bin/javac" -proc:none -nowarn -encoding UTF-8 -Xmaxerrs 500 -d "$OUT" -cp "$CP" "$@" 2>&1 | grep -v '^Note:' || true
