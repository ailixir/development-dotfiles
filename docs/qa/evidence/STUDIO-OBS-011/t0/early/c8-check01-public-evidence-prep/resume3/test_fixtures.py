"""Synthetic v2 authority/receipt fixtures. Never imported by production code."""
import hashlib

def receipt(raw, provenance):
    node=dict(dev=1,inode=501,mode=0o140700,uid=501)
    return dict(protocolVersion=2,controlSha256='9'*64,codePins=dict(provenance),ready=True,
        custodyConfirmed=True,enrollmentCount=1,dataCount=1,ackCount=1,commitCount=1,
        callerAckConfirmed=True,callerElapsedNs=1000000,conservativeElapsedNs=2000000,
        peerEofObserved=True,qualified=True,threadTerminated=True,descriptorsClosed=True,
        stopRequested=True,failure=False,projectionSha256=hashlib.sha256(raw).hexdigest(),
        peerIdentity=dict(pid=40001,ppid=40000,kernelStartSeconds=100,kernelStartMicroseconds=1,
            processImage='/synthetic/java',uid=501,kernelIdentityComplete=True,identityComplete=True,
            start='Mon Oct 19 09:00:00 2026',argvHash='6'*64,executableFileHash='7'*64),
        shortNamespace=dict(node,mode=0o40700),socketNode=dict(node),
        fdIdentities=dict(listener=dict(node,inode=502),connection=dict(node,inode=503)),
        closeOutcomes=dict(connection=True,listener=True,selector=True,short=True,parent=True))
