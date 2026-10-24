"""Prepared data inspection only. Never imports application code or prints malformed payloads."""
import json,math,sys
from pathlib import Path

def incomplete(code):
    print(json.dumps({'readerValid':False,'complete':False,'reasonCode':code,'records':[]}))
    raise SystemExit(2)

try:
    path=Path(sys.argv[1])
    if not path.is_file() or path.is_symlink() or path.stat().st_size>32768: incomplete(1)
    value=json.loads(path.read_text())
    keys={'complete','overflow','instrumentationFailed','minimumEventsSeen','originalTestFailed','records'}
    if type(value) is not dict or set(value)!=keys: incomplete(2)
    if any(type(value[k]) is not bool for k in keys-{'records'}): incomplete(3)
    rows=value['records']
    if type(rows) is not list or len(rows)>32: incomplete(4)
    last=0.0
    for index,row in enumerate(rows,1):
        if type(row) is not dict or set(row)!={'event','order','monoMs','a','b','c','flagA','flagB'}: incomplete(5)
        if type(row['event']) is not int or not 1<=row['event']<=9 or type(row['order']) is not int or row['order']!=index: incomplete(6)
        if any(type(row[k]) not in [int,float] or not math.isfinite(row[k]) for k in ['monoMs','a','b','c']): incomplete(7)
        if any(type(row[k]) is not bool for k in ['flagA','flagB']) or row['monoMs']<last: incomplete(8)
        event=row['event']
        if event in [1,2] and (row['flagA'] or row['flagB']): incomplete(12)
        if event==1 and (row['a']<0 or row['b']<1): incomplete(13)
        if event==2 and (row['b']<0 or row['c']<1): incomplete(14)
        if event==3 and (row['b'] not in [0,1] or row['c']!=0): incomplete(15)
        if event in [4,6] and (any(row[k]!=0 for k in ['a','b','c']) or row['flagA'] or row['flagB']): incomplete(16)
        if event in [5,7,8,9] and (row['b']!=0 or row['c']!=0 or row['flagB']): incomplete(17)
        if event in [7,8,9] and row['flagA']: incomplete(18)
        if event==7 and (type(row['a']) is not int or row['a']<0): incomplete(19)
        last=row['monoMs']
    required=all(any(row['event']==code for row in rows) for code in [1,2,3,4,5,6,7])
    if value['minimumEventsSeen']!=required: incomplete(9)
    complete=not value['overflow'] and not value['instrumentationFailed'] and required
    if value['complete']!=complete: incomplete(10)
except SystemExit:
    raise
except Exception:
    incomplete(11)
print(json.dumps({'readerValid':True,**value},indent=2))
raise SystemExit(0 if value['complete'] else 2)
