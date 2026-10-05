using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchBackup(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "backup:getStatus":
                    var backupStatus = DatabaseService.Backup.GetStatus();
                    response = BridgeResponse.Ok(request.Id, backupStatus);
                    return true;

                case "backup:create":
                    string customFolder = null;
                    if (request.Payload != null)
                    {
                        JObject bkObj = request.Payload as JObject;
                        if (bkObj != null && bkObj["folder"] != null)
                        {
                            customFolder = bkObj["folder"].ToString();
                        }
                    }
                    var createResult = DatabaseService.Backup.CreateBackup(customFolder);
                    response = BridgeResponse.Ok(request.Id, createResult);
                    return true;

                case "backup:getDrives":
                    var drives = DatabaseService.Backup.GetAvailableDrives();
                    response = BridgeResponse.Ok(request.Id, drives);
                    return true;

                case "backup:configure":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إعدادات النسخ فارغة");
                        return true;
                    }
                    JObject cfgObj = request.Payload as JObject;
                    string bFolder = cfgObj != null && cfgObj["targetFolder"] != null ? cfgObj["targetFolder"].ToString() : "";
                    bool bAutoClose = cfgObj != null && cfgObj["autoOnClose"] != null ? cfgObj["autoOnClose"].Value<bool>() : true;
                    bool bAutoDaily = cfgObj != null && cfgObj["autoDaily"] != null ? cfgObj["autoDaily"].Value<bool>() : true;
                    int bRetDays = cfgObj != null && cfgObj["retentionDays"] != null ? cfgObj["retentionDays"].Value<int>() : 7;
                    int bRetWeeks = cfgObj != null && cfgObj["retentionWeeks"] != null ? cfgObj["retentionWeeks"].Value<int>() : 4;
                    int bWarnDays = cfgObj != null && cfgObj["warnAfterDays"] != null ? cfgObj["warnAfterDays"].Value<int>() : 2;
                    int bMaxCopies = cfgObj != null && cfgObj["maxCopies"] != null ? cfgObj["maxCopies"].Value<int>() : 20;

                    DatabaseService.Backup.SaveConfiguration(bFolder, bAutoClose, bAutoDaily, bRetDays, bRetWeeks, bWarnDays, bMaxCopies);
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "database:checkIntegrity":
                    var dbIntegrity = DatabaseService.CheckDatabaseIntegrity();
                    response = BridgeResponse.Ok(request.Id, dbIntegrity);
                    return true;

                case "database:restore":
                    string restoreFilePath = null;
                    string restoreMasterKey = null;
                    if (request.Payload != null)
                    {
                        JObject rObj = request.Payload as JObject;
                        if (rObj != null)
                        {
                            if (rObj["backupFilePath"] != null)
                            {
                                restoreFilePath = rObj["backupFilePath"].ToString();
                            }
                            if (rObj["masterKey"] != null)
                            {
                                restoreMasterKey = rObj["masterKey"].ToString();
                            }
                            else if (rObj["password"] != null)
                            {
                                restoreMasterKey = rObj["password"].ToString();
                            }
                        }
                    }
                    var restoreResult = DatabaseService.RestoreFromBackup(restoreFilePath, restoreMasterKey);
                    if (restoreResult.Success)
                    {
                        response = BridgeResponse.Ok(request.Id, new { success = true, message = restoreResult.Message });
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "RESTORE_FAILED", restoreResult.Message);
                    }
                    return true;

                case "backup:verify":
                    string verifyFilePath = "";
                    if (request.Payload != null)
                    {
                        JObject vObj = request.Payload as JObject;
                        if (vObj != null && vObj["backupFilePath"] != null)
                        {
                            verifyFilePath = vObj["backupFilePath"].ToString();
                        }
                        else
                        {
                            verifyFilePath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    bool isVerified = DatabaseService.Backup.VerifyBackupIntegrity(verifyFilePath);
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = isVerified,
                        isVerified = isVerified,
                        message = isVerified
                            ? "تم فحص النسخة الاحتياطية بنجاح: بنية B-Tree سليمة وتطابق أعداد الأصناف والفواتير مع قاعدة البيانات الأصلية."
                            : "فشل فحص النسخة الاحتياطية: الملف تالف أو لا يطابق سجلات النظام."
                    });
                    return true;

                case "license:getInfo":
                    var licInfo = DatabaseService.License != null ? DatabaseService.License.GetLicenseInfo() : null;
                    response = BridgeResponse.Ok(request.Id, licInfo);
                    return true;

                case "license:activate":
                    string licKey = "";
                    if (request.Payload != null)
                    {
                        JObject licObj = request.Payload as JObject;
                        if (licObj == null)
                        {
                            try
                            {
                                licObj = JObject.Parse(request.Payload.ToString());
                            }
                            catch { }
                        }
                        if (licObj != null)
                        {
                            if (licObj["licenseKey"] != null) licKey = licObj["licenseKey"].ToString();
                            else if (licObj["key"] != null) licKey = licObj["key"].ToString();
                        }
                    }
                    var actResult = DatabaseService.License != null 
                        ? DatabaseService.License.ActivateLicense(licKey)
                        : new LicenseOperationResult { Success = false, Message = "خدمة التراخيص غير مهيأة" };
                    response = BridgeResponse.Ok(request.Id, actResult);
                    return true;

                case "license:verify":
                    var verResult = DatabaseService.License != null 
                        ? DatabaseService.License.VerifyLicenseOnline()
                        : new LicenseOperationResult { Success = false, Message = "خدمة التراخيص غير مهيأة" };
                    response = BridgeResponse.Ok(request.Id, verResult);
                    return true;

                case "license:checkExpiry":
                    var chkExpiry = DatabaseService.License != null 
                        ? DatabaseService.License.CheckExpiry() 
                        : null;
                    response = BridgeResponse.Ok(request.Id, chkExpiry);
                    return true;

                case "license:deactivateForTransfer":
                    string transReason = "";
                    if (request.Payload != null)
                    {
                        JObject transObj = request.Payload as JObject;
                        if (transObj != null && transObj["reason"] != null)
                        {
                            transReason = transObj["reason"].ToString();
                        }
                    }
                    var deactRes = DatabaseService.License != null
                        ? DatabaseService.License.DeactivateForTransfer(transReason)
                        : new LicenseOperationResult { Success = false, Message = "خدمة التراخيص غير مهيأة" };
                    response = BridgeResponse.Ok(request.Id, deactRes);
                    return true;

                case "license:activateSupportCode":
                    string supCode = "";
                    string supShop = "";
                    if (request.Payload != null)
                    {
                        JObject actSupObj = request.Payload as JObject;
                        if (actSupObj != null)
                        {
                            if (actSupObj["supportCode"] != null) supCode = actSupObj["supportCode"].ToString();
                            else if (actSupObj["code"] != null) supCode = actSupObj["code"].ToString();
                            if (actSupObj["shopName"] != null) supShop = actSupObj["shopName"].ToString();
                        }
                    }
                    var actSupRes = DatabaseService.License != null
                        ? DatabaseService.License.ActivateWithSupportCode(supCode, supShop)
                        : new LicenseOperationResult { Success = false, Message = "خدمة التراخيص غير مهيأة" };
                    response = BridgeResponse.Ok(request.Id, actSupRes);
                    return true;

                case "license:generateSupportCode":
                    string genFp = "";
                    string genType = "lifetime";
                    int genDays = 9999;
                    if (request.Payload != null)
                    {
                        JObject genObj = request.Payload as JObject;
                        if (genObj != null)
                        {
                            if (genObj["deviceFingerprint"] != null) genFp = genObj["deviceFingerprint"].ToString();
                            if (genObj["licenseType"] != null) genType = genObj["licenseType"].ToString();
                            if (genObj["days"] != null) genDays = genObj["days"].Value<int>();
                        }
                    }
                    if (string.IsNullOrEmpty(genFp))
                    {
                        genFp = EncryptionService.GenerateDeviceFingerprint();
                    }
                    string generatedCode = LicenseService.GenerateOfflineSupportCode(genFp, genType, genDays);
                    response = BridgeResponse.Ok(request.Id, new { supportCode = generatedCode, deviceFingerprint = genFp });
                    return true;

                case "license:runTests":
                    var licTestRes = LicenseTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, licTestRes);
                    return true;

                case "migration:getMetrics":
                    var curMetrics = DatabaseService.Migration != null ? DatabaseService.Migration.GetCurrentMetrics() : new MigrationAuditMetrics();
                    response = BridgeResponse.Ok(request.Id, curMetrics);
                    return true;

                case "migration:export":
                    string exportFolder = null;
                    if (request.Payload != null)
                    {
                        JObject expObj = request.Payload as JObject;
                        if (expObj != null && expObj["folder"] != null)
                        {
                            exportFolder = expObj["folder"].ToString();
                        }
                    }
                    var expResult = DatabaseService.Migration != null
                        ? DatabaseService.Migration.CreateMigrationPackage(exportFolder)
                        : new MigrationPackageExportResult { Success = false, Message = "خدمة النقل غير متوفرة." };
                    response = BridgeResponse.Ok(request.Id, expResult);
                    return true;

                case "migration:inspect":
                    string inspectPath = null;
                    if (request.Payload != null)
                    {
                        JObject insObj = request.Payload as JObject;
                        if (insObj != null && insObj["packagePath"] != null)
                        {
                            inspectPath = insObj["packagePath"].ToString();
                        }
                        else
                        {
                            inspectPath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    var insResult = DatabaseService.Migration != null
                        ? DatabaseService.Migration.InspectPackage(inspectPath)
                        : new MigrationPackageInspectResult { Success = false, Message = "خدمة النقل غير متوفرة." };
                    response = BridgeResponse.Ok(request.Id, insResult);
                    return true;

                case "migration:restore":
                    string restorePkgPath = null;
                    if (request.Payload != null)
                    {
                        JObject resObj = request.Payload as JObject;
                        if (resObj != null && resObj["packagePath"] != null)
                        {
                            restorePkgPath = resObj["packagePath"].ToString();
                        }
                        else
                        {
                            restorePkgPath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    var restResult = DatabaseService.Migration != null
                        ? DatabaseService.Migration.RestorePackage(restorePkgPath)
                        : new MigrationRestoreResult { Success = false, Message = "خدمة النقل غير متوفرة." };
                    response = BridgeResponse.Ok(request.Id, restResult);
                    return true;

                case "migration:runTests":
                    var migTestRes = MigrationTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, migTestRes);
                    return true;

                case "migration:browseFile":
                    string selectedFile = null;
                    var fileThread = new System.Threading.Thread(delegate()
                    {
                        using (var ofd = new System.Windows.Forms.OpenFileDialog())
                        {
                            ofd.Filter = "حزمة رفيق للنقل (*.rafiqpkg;*.zip)|*.rafiqpkg;*.zip|جميع الملفات (*.*)|*.*";
                            ofd.Title = "اختر حزمة نقل نظام رفيق لاسترجاعها";
                            if (ofd.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                            {
                                selectedFile = ofd.FileName;
                            }
                        }
                    });
                    fileThread.SetApartmentState(System.Threading.ApartmentState.STA);
                    fileThread.Start();
                    fileThread.Join();
                    response = BridgeResponse.Ok(request.Id, new { selectedPath = selectedFile, cancelled = string.IsNullOrEmpty(selectedFile) });
                    return true;

                case "migration:browseFolder":
                    string selectedFolder = null;
                    var folderThread = new System.Threading.Thread(delegate()
                    {
                        using (var fbd = new System.Windows.Forms.FolderBrowserDialog())
                        {
                            fbd.Description = "اختر المجلد أو الفلاشة لحفظ حزمة النقل";
                            if (fbd.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                            {
                                selectedFolder = fbd.SelectedPath;
                            }
                        }
                    });
                    folderThread.SetApartmentState(System.Threading.ApartmentState.STA);
                    folderThread.Start();
                    folderThread.Join();
                    response = BridgeResponse.Ok(request.Id, new { selectedFolder = selectedFolder, cancelled = string.IsNullOrEmpty(selectedFolder) });
                    return true;

                case "updates:check":
                    string manifestOrUrl = null;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null && pObj["url"] != null)
                        {
                            manifestOrUrl = pObj["url"].ToString();
                        }
                    }
                    var updateInfo = DatabaseService.Updates.CheckForUpdates(manifestOrUrl);
                    response = BridgeResponse.Ok(request.Id, updateInfo);
                    return true;

                case "updates:apply":
                    string pkgPath = null;
                    string expectedSha = null;
                    bool simFail = false;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null)
                        {
                            if (pObj["packagePath"] != null) pkgPath = pObj["packagePath"].ToString();
                            if (pObj["expectedSha256"] != null) expectedSha = pObj["expectedSha256"].ToString();
                            if (pObj["simulateFailure"] != null) simFail = pObj["simulateFailure"].Value<bool>();
                        }
                    }
                    var updateApplyRes = DatabaseService.Updates.ApplyUpdate(pkgPath, expectedSha, simFail);
                    response = BridgeResponse.Ok(request.Id, updateApplyRes);
                    return true;

                case "updates:runTests":
                    var updateTestRes = AppUpdateTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, updateTestRes);
                    return true;

                default:
                    return false;
            }
        }
    }
}
