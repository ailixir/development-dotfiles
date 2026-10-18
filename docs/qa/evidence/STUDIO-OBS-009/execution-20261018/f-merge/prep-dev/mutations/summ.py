import glob,sys,xml.etree.ElementTree as ET
for d in sys.argv[1:]:
    tot=[0,0,0,0]
    reds=[]
    for f in sorted(glob.glob(d+'/*.xml')):
        r=ET.parse(f).getroot()
        for i,k in enumerate(['tests','failures','errors','skipped']): tot[i]+=int(r.attrib[k])
        for tc in r.iter('testcase'):
            if tc.find('failure') is not None or tc.find('error') is not None: reds.append(r.attrib['name'].split('.')[-1]+' :: '+tc.attrib['name'][:90])
    print(d.split('/')[-1],'tests/fail/err/skip',tot); [print('   RED',x) for x in reds]
