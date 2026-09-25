import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Story 56 & 57: Installer & Prerequisites Verification (Features #12 & #160)', () => {
  const issPath = path.resolve('..', 'installer', 'RafiqPOS_Setup.iss');

  it('Task 12-1 & 12-2: Inno Setup script exists with Windows 7 SP1 and data protection invariants', () => {
    assert.ok(fs.existsSync(issPath), 'RafiqPOS_Setup.iss must exist in installer directory');
    const content = fs.readFileSync(issPath, 'utf8');

    // 1. MinVersion requirement (Windows 7 SP1)
    assert.ok(content.includes('MinVersion=6.1sp1'), 'Setup must enforce Windows 7 SP1 as minimum OS');

    // 2. Data persistence invariant (uninsneveruninstall)
    assert.ok(
      content.includes('uninsneveruninstall'),
      'Database file must be marked with uninsneveruninstall to prevent data loss on uninstall'
    );
    assert.ok(
      content.includes('onlyifdoesntexist'),
      'Database installation must use onlyifdoesntexist to prevent overwriting existing data on upgrades'
    );

    // 3. Desktop shortcut task
    assert.ok(content.includes('{autodesktop}'), 'Setup must include a desktop icon task');

    // 4. Arabic language support
    assert.ok(content.includes('compiler:Languages\\Arabic.isl'), 'Setup must support native Arabic language interface');
  });

  it('Task 160-1 & 160-4: Validates Windows 7 SP1, SHA-2 and .NET 4.8 prerequisite checks with Arabic guidance', () => {
    const content = fs.readFileSync(issPath, 'utf8');

    // SP1 check function
    assert.ok(content.includes('IsWin7MissingSP1'), 'Script must have check for Windows 7 SP1');
    assert.ok(content.includes('ServicePackMajor < 1'), 'Script must check for missing Service Pack 1');

    // .NET Framework 4.6.2+ release key check (>= 394802)
    assert.ok(content.includes('IsDotNetCompatible'), 'Script must verify compatible .NET Framework');
    assert.ok(content.includes('394802'), 'Script must check release DWORD for .NET 4.6.2/4.7.2/4.8');

    // Arabic guidance messages instead of error codes
    assert.ok(content.includes('خطوات الحل بالعربي:'), 'Script must provide clear Arabic guidance steps');
    assert.ok(content.includes('Windows 7 Service Pack 1'), 'Script must explicitly mention Windows 7 SP1 solution');
    assert.ok(content.includes('KB4474419'), 'Script must explain the SHA-2 update requirement');
  });

  it('Task 12-3: Verifies upgrade safety policy (data preserved in ProgramData outside app directory)', () => {
    const content = fs.readFileSync(issPath, 'utf8');

    // Program files directory vs CommonAppData directory
    assert.ok(content.includes('{commonappdata}\\RafiqPOS\\data'), 'Data must be stored in ProgramData outside install dir');
    assert.ok(content.includes('{autopf}\\RafiqPOS'), 'App binaries must be in Program Files');
  });

  it('Task 12-4: Code signing decision document exists with comprehensive engineering rationale', () => {
    const docPath = path.resolve('..', 'قرار_التوقيع_الرقمي_Code_Signing.md');
    assert.ok(fs.existsSync(docPath), 'قرار_التوقيع_الرقمي_Code_Signing.md must exist');
    const docContent = fs.readFileSync(docPath, 'utf8');

    assert.ok(docContent.includes('SmartScreen'), 'Doc must analyze Windows SmartScreen behavior');
    assert.ok(docContent.includes('SHA-2'), 'Doc must analyze SHA-2 cryptographic compatibility');
    assert.ok(docContent.includes('Self-Signed'), 'Doc must detail self-signed / root certificate deployment');
  });

  it('Task 160-3: Offline fixed runtime 109 deployment strategy is documented and supported', () => {
    const win7DocPath = path.resolve('..', 'دليل_تشغيل_ويندوز7.md');
    assert.ok(fs.existsSync(win7DocPath), 'دليل_تشغيل_ويندوز7.md must exist');
    const win7Doc = fs.readFileSync(win7DocPath, 'utf8');

    assert.ok(win7Doc.includes('109.0.1518.140'), 'Doc must specify Fixed Runtime version 109');
    assert.ok(win7Doc.includes('KB4474419'), 'Doc must reference SHA-2 update KB4474419');
    assert.ok(win7Doc.includes('KB4490628'), 'Doc must reference Servicing Stack update KB4490628');
  });
});
