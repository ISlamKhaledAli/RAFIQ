import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

describe('Insurance & DDI Excel Export: User Save Location Choice (SaveFileDialog & Open File/Folder)', () => {
  const insuranceViewPath = path.join(ROOT, 'frontend', 'src', 'views', 'insurance', 'InsuranceContractsView.tsx');
  const ddiModalPath = path.join(ROOT, 'frontend', 'src', 'components', 'DrugInteractionManagerModal.tsx');
  const ipcPath = path.join(ROOT, 'frontend', 'src', 'bridge', 'ipc.ts');
  const ipcDispatcherSystemPath = path.join(ROOT, 'desktop', 'Bridge', 'IpcDispatcher.System.cs');
  const ipcDispatcherPath = path.join(ROOT, 'desktop', 'Bridge', 'IpcDispatcher.cs');
  const insuranceServicePath = path.join(ROOT, 'desktop', 'Services', 'InsuranceService.cs');

  it('InsuranceContractsView prompts the user with system:showSaveFileDialog before exporting', () => {
    const content = fs.readFileSync(insuranceViewPath, 'utf8');
    assert.match(content, /system:showSaveFileDialog/, 'Must invoke system:showSaveFileDialog');
    assert.match(content, /defaultFileName/, 'Must provide a formatted default file name');
    assert.match(content, /dialogRes\?\.cancelled/, 'Must gracefully handle user cancellation');
    assert.match(content, /filePath:\s*dialogRes\.filePath/, 'Must pass the chosen filePath to insurance:exportBatchExcel');
  });

  it('InsuranceContractsView provides Open File and Open Folder action buttons in the success banner', () => {
    const content = fs.readFileSync(insuranceViewPath, 'utf8');
    assert.match(content, /FileSpreadsheet/, 'Must import FileSpreadsheet icon');
    assert.match(content, /FolderOpen/, 'Must import FolderOpen icon');
    assert.match(content, /system:openPath/, 'Must allow opening the file directly via system:openPath');
    assert.match(content, /system:showInFolder/, 'Must allow showing the file in explorer via system:showInFolder');
    assert.match(content, />\s*فتح الملف\s*</, 'Must have button label "فتح الملف"');
    assert.match(content, />\s*عرض في المجلد\s*</, 'Must have button label "عرض في المجلد"');
  });

  it('C# IpcDispatcher.System handles system:showSaveFileDialog, system:openPath, and system:showInFolder', () => {
    const content = fs.readFileSync(ipcDispatcherSystemPath, 'utf8');
    assert.match(content, /case "system:showSaveFileDialog":/, 'Must handle system:showSaveFileDialog');
    assert.match(content, /SaveFileDialog\(\)/, 'Must instantiate SaveFileDialog');
    assert.match(content, /case "system:openPath":/, 'Must handle system:openPath');
    assert.match(content, /case "system:showInFolder":/, 'Must handle system:showInFolder');
    assert.match(content, /explorer\.exe/, 'Must use explorer.exe for folder display');
  });

  it('C# IpcDispatcher registers system:showSaveFileDialog, openPath, showInFolder with REQUIRE_SESSION', () => {
    const content = fs.readFileSync(ipcDispatcherPath, 'utf8');
    assert.match(content, /\{ "system:showSaveFileDialog", REQUIRE_SESSION \}/);
    assert.match(content, /\{ "system:openPath", REQUIRE_SESSION \}/);
    assert.match(content, /\{ "system:showInFolder", REQUIRE_SESSION \}/);
  });

  it('InsuranceService ensures target directory exists and uses MyDocuments as default fallback instead of hidden AppData', () => {
    const content = fs.readFileSync(insuranceServicePath, 'utf8');
    assert.match(content, /Environment\.SpecialFolder\.MyDocuments/, 'Must use MyDocuments as fallback');
    assert.match(content, /Directory\.CreateDirectory\(targetDir\)/, 'Must ensure chosen target directory exists');
  });

  it('Frontend bridge/ipc.ts provides mock handlers for the new dialog and file actions', () => {
    const content = fs.readFileSync(ipcPath, 'utf8');
    assert.match(content, /case 'system:showSaveFileDialog':/);
    assert.match(content, /case 'system:openPath':/);
    assert.match(content, /case 'system:showInFolder':/);
  });

  it('DrugInteractionManagerModal also allows user to pick save location with system:showSaveFileDialog', () => {
    const content = fs.readFileSync(ddiModalPath, 'utf8');
    assert.match(content, /system:showSaveFileDialog/);
    assert.match(content, /targetPath:\s*dialogRes\.filePath/);
  });
});
