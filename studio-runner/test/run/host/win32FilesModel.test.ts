/**
 * The pure half of the win32 file host (ADR-SC-009), run on every OS: the private-root SDDL verdict, the Windows
 * `isInside`, the sharing-violation classification, and the whoami / icacls text they read and write. Nothing here
 * spawns a process or touches a Windows filesystem.
 */
import { describe, expect, it } from 'vitest';

import {
  ADMINISTRATORS_SID, SYSTEM_SID, evaluatePrivateRootSddl, isInsideWin32, isSharingViolationError, parseWhoamiSid, privateRootGrantArguments, sddlFromIcaclsSave,
} from '../../../src/run/host/win32FilesModel.js';

const USER = 'S-1-5-21-1111111111-2222222222-3333333333-1001';
const OURS = `(A;OICI;FA;;;${USER})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)`;
const verdict = (sddl: string): string => { const v = evaluatePrivateRootSddl(sddl, USER); return v.ok ? 'ok' : v.reason; };

describe('evaluatePrivateRootSddl accepts the protected root icacls makes', () => {
  it('as icacls /save reports it, with aliases or full SIDs, any case, in any order', () => {
    expect(verdict(`D:PAI${OURS}`)).toBe('ok');
    expect(verdict(`D:PAI(A;OICI;FA;;;${SYSTEM_SID})(A;OICI;FA;;;${ADMINISTRATORS_SID})(A;OICI;FA;;;${USER.toLowerCase()})`)).toBe('ok');
    expect(verdict(`D:P(a;CIOI;0x1f01ff;;;${USER})`)).toBe('ok');
  });

  it('as Get-Acl reports it, with an owner that is one of the three and any group', () => {
    expect(verdict(`O:${USER}G:S-1-5-21-1111111111-2222222222-3333333333-513D:PAI${OURS}`)).toBe('ok');
    expect(verdict(`O:BAG:SYD:PAI${OURS}`)).toBe('ok');
  });
});

describe('evaluatePrivateRootSddl refuses anything else (fail closed)', () => {
  it('an extra allow-ACE for another principal, alias or SID', () => {
    expect(verdict(`D:PAI${OURS}(A;OICI;0x1200a9;;;BU)`)).toMatch(/another principal/u);
    expect(verdict(`D:PAI${OURS}(A;OICI;FA;;;S-1-5-21-1111111111-2222222222-3333333333-1002)`)).toMatch(/another principal/u);
    expect(verdict(`D:PAI${OURS}(A;;FA;;;WD)`)).toMatch(/another principal/u);
  });

  it('a DACL that is not protected, null, empty, missing or with an unknown control flag', () => {
    expect(verdict(`D:AI${OURS}`)).toMatch(/not protected/u);
    expect(verdict(`D:${OURS}`)).toMatch(/not protected/u);
    expect(verdict('D:NO_ACCESS_CONTROL')).toMatch(/null/u);
    expect(verdict('D:P')).toMatch(/empty/u);
    expect(verdict(`O:${USER}`)).toMatch(/no DACL/u);
    expect(verdict(`D:PXY${OURS}`)).toMatch(/unknown control flags/u);
  });

  it('a deny-ACE, even for an allowed principal and even though it only narrows access', () => {
    expect(verdict(`D:PAI(D;OICI;FA;;;WD)${OURS}`)).toMatch(/non-allow ACE \(D\)/u);
    expect(verdict(`D:PAI${OURS}(D;OICI;WD;;;${USER})`)).toMatch(/non-allow ACE \(D\)/u);
  });

  it('object, callback and audit ACEs, and an inherited ACE', () => {
    expect(verdict(`D:PAI${OURS}(OA;;FA;bf967aba-0de6-11d0-a285-00aa003049e2;;SY)`)).toMatch(/non-allow ACE \(OA\)/u);
    expect(verdict(`D:PAI${OURS}(XA;;FA;;;SY;(Member_of {SID(BA)}))`)).toMatch(/non-allow ACE \(XA\)/u);
    expect(verdict(`D:PAI${OURS}(AU;SA;FA;;;SY)`)).toMatch(/non-allow ACE \(AU\)/u);
    expect(verdict(`D:PAI(A;OICIID;FA;;;${USER})(A;OICI;FA;;;SY)`)).toMatch(/inherited/u);
  });

  it('a user without inherited full control', () => {
    expect(verdict('D:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)')).toMatch(/lacks/u);
    expect(verdict(`D:PAI(A;OICI;0x1200a9;;;${USER})(A;OICI;FA;;;SY)`)).toMatch(/lacks/u);
    expect(verdict(`D:PAI(A;CI;FA;;;${USER})`)).toMatch(/lacks/u);
    expect(verdict(`D:PAI(A;OICIIO;FA;;;${USER})`)).toMatch(/lacks/u);
  });

  it('an owner that is another principal, malformed SDDL and a non-SID user', () => {
    expect(verdict(`O:BUD:PAI${OURS}`)).toMatch(/owner/u);
    for (const bad of ['', 'garbage', `D:PAI(A;OICI;FA;;;${USER}`, `D:PAI${OURS})`, 'D:PAI(A;OICI;FA)', `D:PAI${OURS}D:P`, `D:PAI x${OURS}`]) expect(verdict(bad)).toMatch(/not SDDL|unknown control flags/u);
    expect(evaluatePrivateRootSddl(`D:PAI${OURS}`, 'not-a-sid')).toEqual({ ok: false, reason: 'the user SID is not a SID' });
  });
});

describe('isInsideWin32', () => {
  it('is strictly inside, by drive letter, any case and either slash', () => {
    expect(isInsideWin32('C:\\scratch', 'C:\\scratch\\run-1')).toBe(true);
    expect(isInsideWin32('C:\\Scratch', 'c:\\SCRATCH\\Run-1\\video.webm')).toBe(true);
    expect(isInsideWin32('C:\\scratch\\', 'C:/scratch/run-1')).toBe(true);
    expect(isInsideWin32('C:\\scratch', 'C:\\scratch\\..name')).toBe(true);
  });

  it('is not inside for equality, a parent, a sibling prefix, an escape or another drive', () => {
    expect(isInsideWin32('C:\\scratch', 'C:\\scratch')).toBe(false);
    expect(isInsideWin32('C:\\scratch', 'c:\\SCRATCH\\')).toBe(false);
    expect(isInsideWin32('C:\\scratch', 'C:\\')).toBe(false);
    expect(isInsideWin32('C:\\scratch', 'C:\\scratch-other\\x')).toBe(false);
    expect(isInsideWin32('C:\\scratch', 'C:\\scratch\\..\\x')).toBe(false);
    expect(isInsideWin32('C:\\scratch', 'D:\\scratch\\x')).toBe(false);
  });

  it('works on UNC paths and refuses another share or server', () => {
    expect(isInsideWin32('\\\\srv\\share\\root', '\\\\SRV\\Share\\root\\a\\b')).toBe(true);
    expect(isInsideWin32('\\\\srv\\share\\root', '\\\\srv\\share\\root')).toBe(false);
    expect(isInsideWin32('\\\\srv\\share\\root', '\\\\srv\\other\\root\\a')).toBe(false);
    expect(isInsideWin32('\\\\srv\\share\\root', '\\\\other\\share\\root\\a')).toBe(false);
    expect(isInsideWin32('C:\\root', '\\\\srv\\share\\root\\a')).toBe(false);
  });
});

describe('isSharingViolationError', () => {
  const error = (code: string, syscall?: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code, ...(syscall === undefined ? {} : { syscall }) });

  it('is EBUSY, EPERM or EACCES from a rename, unlink, rmdir or rm', () => {
    for (const code of ['EBUSY', 'EPERM', 'EACCES']) for (const syscall of ['rename', 'unlink', 'rmdir', 'rm']) expect(isSharingViolationError(error(code, syscall))).toBe(true);
  });

  it('is nothing else: other codes, other syscalls, no syscall, non-errors', () => {
    expect(isSharingViolationError(error('ENOENT', 'rename'))).toBe(false);
    expect(isSharingViolationError(error('ENOTEMPTY', 'rmdir'))).toBe(false);
    expect(isSharingViolationError(error('EPERM', 'open'))).toBe(false);
    expect(isSharingViolationError(error('EBUSY', 'read'))).toBe(false);
    expect(isSharingViolationError(error('EBUSY'))).toBe(false);
    for (const value of [null, undefined, 'EBUSY', 16, { code: 16, syscall: 'rename' }]) expect(isSharingViolationError(value)).toBe(false);
  });
});

describe('the text whoami and icacls exchange', () => {
  it('reads exactly one user SID from whoami /user /fo csv /nh', () => {
    expect(parseWhoamiSid(`"desktop-1\\dev","${USER}"\r\n`)).toBe(USER);
    expect(parseWhoamiSid('')).toBeNull();
    expect(parseWhoamiSid(`"a\\b","${USER}"\r\n"c\\d","${USER}"\r\n`)).toBeNull();
    expect(parseWhoamiSid('"a\\b","S-1-x"')).toBeNull();
    expect(parseWhoamiSid('"a\\b","S-1"')).toBeNull();
  });

  it('grants by SID: protected, replaced grants, inherited full control for the user, SYSTEM and Administrators only', () => {
    expect(privateRootGrantArguments('C:\\Temp\\root', USER)).toEqual([
      'C:\\Temp\\root', '/inheritance:r', '/grant:r', `*${USER}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F',
    ]);
  });

  it('reads the one DACL line of an icacls /save file, UTF-16LE with or without a BOM, or UTF-8', () => {
    const saved = `root\r\nD:PAI${OURS}\r\n`;
    expect(sddlFromIcaclsSave(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(saved, 'utf16le')]))).toBe(`D:PAI${OURS}`);
    expect(sddlFromIcaclsSave(Buffer.from(saved, 'utf16le'))).toBe(`D:PAI${OURS}`);
    expect(sddlFromIcaclsSave(Buffer.from(saved, 'utf8'))).toBe(`D:PAI${OURS}`);
    expect(sddlFromIcaclsSave(Buffer.from('root\r\n', 'utf16le'))).toBeNull();
    expect(sddlFromIcaclsSave(Buffer.from(`a\r\nD:P${OURS}\r\nb\r\nD:P${OURS}\r\n`, 'utf16le'))).toBeNull();
  });
});
