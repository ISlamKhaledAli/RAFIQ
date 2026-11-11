using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
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
                    string backupListFrom = null;
                    string backupListTo = null;
                    int backupListLimit = 0;
                    JObject backupStatusObj = request.Payload as JObject;
                    if (backupStatusObj != null)
                    {
                        if (backupStatusObj["dateFrom"] != null) backupListFrom = backupStatusObj["dateFrom"].ToString();
                        if (backupStatusObj["dateTo"] != null) backupListTo = backupStatusObj["dateTo"].ToString();
                        if (backupStatusObj["limit"] != null) int.TryParse(backupStatusObj["limit"].ToString(), out backupListLimit);
                    }
                    var backupStatus = DatabaseService.Backup.GetStatus(backupListFrom, backupListTo, backupListLimit);
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
                    string customFolderError = BackupService.ValidateTargetFolder(customFolder);
                    if (customFolderError != null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_FOLDER", customFolderError);
                        return true;
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
                    string bFolder = cfgObj != null && cfgObj["targetFolder"] != null ? cfgObj["targetFolder"].ToString().Trim() : "";
                    string bFolderError = BackupService.ValidateTargetFolder(bFolder);
                    if (bFolderError != null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_FOLDER", bFolderError);
                        return true;
                    }
                    bool bAutoClose = cfgObj != null && cfgObj["autoOnClose"] != null ? cfgObj["autoOnClose"].Value<bool>() : true;
                    bool bAutoDaily = cfgObj != null && cfgObj["autoDaily"] != null ? cfgObj["autoDaily"].Value<bool>() : true;
                    // A missing field keeps the stored (or default) value, so a partial payload never rewrites the retention policy
                    int bRetDays = cfgObj != null && cfgObj["retentionDays"] != null ? cfgObj["retentionDays"].Value<int>() : DatabaseService.Backup.GetRetentionDays();
                    int bRetWeeks = cfgObj != null && cfgObj["retentionWeeks"] != null ? cfgObj["retentionWeeks"].Value<int>() : DatabaseService.Backup.GetRetentionWeeks();
                    int bWarnDays = cfgObj != null && cfgObj["warnAfterDays"] != null ? cfgObj["warnAfterDays"].Value<int>() : DatabaseService.Backup.GetWarnAfterDays();
                    int bMaxCopies = cfgObj != null && cfgObj["maxCopies"] != null ? cfgObj["maxCopies"].Value<int>() : DatabaseService.Backup.GetMaxCopies();

                    // The retention policy decides which backups are deleted: only root changes it; resending the same values is a no-op
                    if (!IsCurrentUserRoot() && DatabaseService.Backup.RetentionWouldChange(bRetDays, bRetWeeks, bMaxCopies))
                    {
                        string retentionWho = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Username : "";
                        Logger.Warn(string.Format("رفض تعديل سياسة الاحتفاظ بالنسخ الاحتياطية للمستخدم {0}: يتطلب حساب الروت.", retentionWho));
                        response = BridgeResponse.Fail(request.Id, "FORBIDDEN", BackupService.RETENTION_ROOT_ONLY_MESSAGE);
                        return true;
                    }

                    DatabaseService.Backup.SaveConfiguration(bFolder, bAutoClose, bAutoDaily, bRetDays, bRetWeeks, bWarnDays, bMaxCopies);
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "backup:getRecoveryStatus":
                    bool isConfirmed = DatabaseService.Settings != null && DatabaseService.Settings.Get("owner_recovery_code_confirmed", "0") == "1";
                    // The plaintext owner recovery code resets the owner PIN, so only the owner (or developer root) sessions may ever see it
                    if (DatabaseService.Security == null || !DatabaseService.Security.IsCurrentSessionOwner())
                    {
                        response = BridgeResponse.Ok(request.Id, new { isConfirmed = isConfirmed });
                        return true;
                    }
                    string curCode = DatabaseService.Backup != null ? DatabaseService.Backup.GetOrCreateRecoveryCode() : "";
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        isConfirmed = isConfirmed,
                        recoveryCode = isConfirmed ? null : curCode,
                        hasRecoveryCode = !string.IsNullOrEmpty(curCode)
                    });
                    return true;

                case "backup:confirmRecoveryCode":
                    if (DatabaseService.Settings != null)
                    {
                        DatabaseService.Settings.Set("owner_recovery_code_confirmed", "1");
                    }
                    response = BridgeResponse.Ok(request.Id, new { success = true });
                    return true;

                case "backup:revealRecoveryCode":
                    string adminPin = null;
                    if (request.Payload != null)
                    {
                        JObject revObj = request.Payload as JObject;
                        if (revObj != null && revObj["pin"] != null) adminPin = revObj["pin"].ToString();
                    }
                    if (!string.IsNullOrEmpty(adminPin) && DatabaseService.Security != null)
                    {
                        var supRes = DatabaseService.Security.VerifySupervisorPin(adminPin, "REVEAL_RECOVERY_CODE", SecurityService.TIER_OWNER);
                        if (!supRes.Success)
                        {
                            response = BridgeResponse.Fail(request.Id, "INVALID_PIN", supRes.Message ?? "PIN المالك غير صحيح.");
                            return true;
                        }
                    }
                    else if (DatabaseService.Security != null && !DatabaseService.Security.IsCurrentSessionOwner())
                    {
                        response = BridgeResponse.Fail(request.Id, "PIN_REQUIRED", "يرجى إدخال PIN المالك لعرض كود الاسترجاع.");
                        return true;
                    }
                    string revealedCode = DatabaseService.Backup != null ? DatabaseService.Backup.GetOrCreateRecoveryCode() : "";
                    response = BridgeResponse.Ok(request.Id, new { success = true, recoveryCode = revealedCode });
                    return true;

                case "database:checkIntegrity":
                    // A corrupt startup already quarantined the file; re-checking would only pile up quarantine copies
                    var dbIntegrity = DatabaseService.IsCorrupted ? DatabaseService.IntegrityStatus : DatabaseService.CheckDatabaseIntegrity();
                    response = BridgeResponse.Ok(request.Id, dbIntegrity);
                    return true;

                case "database:getEncryptionStatus":
                    response = BridgeResponse.Ok(request.Id, DatabaseService.GetEncryptionStatus());
                    return true;

                case "database:exportDecrypted":
                    string exportDecryptedPath = null;
                    JObject exportObj = request.Payload as JObject;
                    if (exportObj != null && exportObj["path"] != null) exportDecryptedPath = exportObj["path"].ToString();
                    TransactionResult exportDecrypted = DatabaseService.ExportDecryptedCopy(exportDecryptedPath);
                    response = exportDecrypted.Success
                        ? BridgeResponse.Ok(request.Id, new { success = true, message = exportDecrypted.Message })
                        : BridgeResponse.Fail(request.Id, "EXPORT_DECRYPTED_FAILED", exportDecrypted.Message);
                    return true;

                case "database:deletePreEncryptionCopy":
                    TransactionResult deleteSealed = DatabaseService.DeletePreEncryptionCopy();
                    response = deleteSealed.Success
                        ? BridgeResponse.Ok(request.Id, new { success = true, message = deleteSealed.Message })
                        : BridgeResponse.Fail(request.Id, "DELETE_PRE_ENCRYPTION_FAILED", deleteSealed.Message);
                    return true;

                case "database:restoreFromPreEncryptionCopy":
                    TransactionResult restoreSealed = DatabaseService.RestoreFromPreEncryptionCopy();
                    response = restoreSealed.Success
                        ? BridgeResponse.Ok(request.Id, new { success = true, message = restoreSealed.Message })
                        : BridgeResponse.Fail(request.Id, "RESTORE_PRE_ENCRYPTION_FAILED", restoreSealed.Message);
                    return true;

                case "database:retryEncryptionConversion":
                    TransactionResult retryConv = DatabaseService.RetryEncryptionConversion();
                    response = BridgeResponse.Ok(request.Id, new { success = retryConv.Success, message = retryConv.Message });
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
                            if (rObj["recoveryCode"] != null)
                            {
                                restoreMasterKey = rObj["recoveryCode"].ToString();
                            }
                            else if (rObj["masterKey"] != null)
                            {
                                restoreMasterKey = rObj["masterKey"].ToString();
                            }
                            else if (rObj["password"] != null)
                            {
                                restoreMasterKey = rObj["password"].ToString();
                            }
                        }
                    }
                    // The owner recovery code is the restore authorisation in every state (not only on a corrupt database):
                    // the file must pass the path gate, be an encrypted Rafiq backup and really open with that code
                    string recoveryError = DatabaseService.ValidateRecoveryBackup(restoreFilePath, restoreMasterKey);
                    if (recoveryError != null)
                    {
                        response = BridgeResponse.Fail(request.Id, "RECOVERY_REJECTED", recoveryError);
                        return true;
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
                    long pCount = 0;
                    long sCount = 0;
                    string vMsg = "";
                    string verifyFullPath;
                    string verifyAllowedFolder = DatabaseService.Settings != null ? DatabaseService.Settings.Get("backup_target_folder", "") : null;
                    string verifyLiveFolder = string.IsNullOrEmpty(DatabaseService.DbPath) ? null : System.IO.Path.GetDirectoryName(DatabaseService.DbPath);
                    string verifyPathError = BackupService.ValidateRestoreSource(verifyFilePath, verifyAllowedFolder, verifyLiveFolder, out verifyFullPath);
                    bool isVerified = verifyPathError == null
                        && DatabaseService.Backup.VerifyBackupDetailed(verifyFullPath, false, out pCount, out sCount, out vMsg);
                    if (verifyPathError != null)
                    {
                        vMsg = verifyPathError;
                    }
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = isVerified,
                        isVerified = isVerified,
                        productsCount = pCount,
                        salesCount = sCount,
                        message = vMsg
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
                    // Support codes must only be generated by the vendor's license server/tools, never on the client (Audit F-04)
                    response = BridgeResponse.Fail(request.Id, "NOT_SUPPORTED", "توليد أكواد الدعم غير متاح من داخل البرنامج. يرجى التواصل مع الدعم الفني.");
                    return true;

                case "license:runTests":
#if DEBUG
                    var licTestRes = LicenseTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, licTestRes);
#else
                    response = BridgeResponse.Fail(request.Id, "NOT_SUPPORTED", "تشغيل الاختبارات الذاتية متاح فقط في وضع التطوير (Debug).");
#endif
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
                    string inspectRecoveryCode = null;
                    if (request.Payload != null)
                    {
                        JObject insObj = request.Payload as JObject;
                        if (insObj != null)
                        {
                            if (insObj["packagePath"] != null) inspectPath = insObj["packagePath"].ToString();
                            if (insObj["recoveryCode"] != null) inspectRecoveryCode = insObj["recoveryCode"].ToString();
                            else if (insObj["password"] != null) inspectRecoveryCode = insObj["password"].ToString();
                        }
                        else
                        {
                            inspectPath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    var insResult = DatabaseService.Migration != null
                        ? DatabaseService.Migration.InspectPackage(inspectPath, inspectRecoveryCode)
                        : new MigrationPackageInspectResult { Success = false, Message = "خدمة النقل غير متوفرة." };
                    response = BridgeResponse.Ok(request.Id, insResult);
                    return true;

                case "migration:restore":
                    string restorePkgPath = null;
                    string restoreRecoveryCode = null;
                    if (request.Payload != null)
                    {
                        JObject resObj = request.Payload as JObject;
                        if (resObj != null)
                        {
                            if (resObj["packagePath"] != null) restorePkgPath = resObj["packagePath"].ToString();
                            if (resObj["recoveryCode"] != null) restoreRecoveryCode = resObj["recoveryCode"].ToString();
                            else if (resObj["password"] != null) restoreRecoveryCode = resObj["password"].ToString();
                        }
                        else
                        {
                            restorePkgPath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    var restResult = DatabaseService.Migration != null
                        ? DatabaseService.Migration.RestorePackage(restorePkgPath, restoreRecoveryCode)
                        : new MigrationRestoreResult { Success = false, Message = "خدمة النقل غير متوفرة." };
                    response = BridgeResponse.Ok(request.Id, restResult);
                    return true;

                case "migration:detectRecoveryCode":
                    string detectPkgPath = null;
                    if (request.Payload != null)
                    {
                        JObject detObj = request.Payload as JObject;
                        if (detObj != null && detObj["packagePath"] != null)
                        {
                            detectPkgPath = detObj["packagePath"].ToString();
                        }
                        else
                        {
                            detectPkgPath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    string autoCode = DatabaseService.Migration != null
                        ? DatabaseService.Migration.TryDetectRecoveryCodeFromFolder(detectPkgPath)
                        : null;
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = !string.IsNullOrEmpty(autoCode),
                        recoveryCode = autoCode
                    });
                    return true;

                case "migration:runTests":
                    var migTestRes = MigrationTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, migTestRes);
                    return true;

                case "migration:browseFile":
                    string selectedFile = null;
                    string initialBrowseFileDir = null;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null && pObj["initialFolder"] != null)
                        {
                            initialBrowseFileDir = pObj["initialFolder"].ToString();
                        }
                    }
                    var fileThread = new System.Threading.Thread(delegate()
                    {
                        using (var ofd = new System.Windows.Forms.OpenFileDialog())
                        {
                            ofd.Filter = "حزمة رفيق للنقل (*.rafiqpkg)|*.rafiqpkg|جميع الملفات (*.*)|*.*";
                            ofd.Title = "اختر حزمة نقل نظام رفيق لاسترجاعها";
                            ofd.CheckFileExists = true;
                            if (!string.IsNullOrEmpty(initialBrowseFileDir) && System.IO.Directory.Exists(initialBrowseFileDir))
                            {
                                ofd.InitialDirectory = initialBrowseFileDir;
                            }
                            IntPtr ownerHwnd = IntPtr.Zero;
                            if (System.Windows.Forms.Application.OpenForms.Count > 0 && System.Windows.Forms.Application.OpenForms[0] != null)
                            {
                                try { ownerHwnd = System.Windows.Forms.Application.OpenForms[0].Handle; } catch { ownerHwnd = IntPtr.Zero; }
                            }
                            System.Windows.Forms.DialogResult dr = (ownerHwnd != IntPtr.Zero)
                                ? ofd.ShowDialog(new FolderSelectDialog.WindowWrapper(ownerHwnd))
                                : ofd.ShowDialog();
                            if (dr == System.Windows.Forms.DialogResult.OK)
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
                    string initialBrowseDir = null;
                    string customFolderTitle = "اختر المجلد أو الفلاشة لحفظ حزمة النقل";
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null)
                        {
                            if (pObj["initialFolder"] != null)
                            {
                                initialBrowseDir = pObj["initialFolder"].ToString();
                            }
                            if (pObj["title"] != null)
                            {
                                customFolderTitle = pObj["title"].ToString();
                            }
                        }
                    }
                    var folderThread = new System.Threading.Thread(delegate()
                    {
                        using (var dlg = new FolderSelectDialog())
                        {
                            dlg.Title = customFolderTitle;
                            dlg.InitialDirectory = initialBrowseDir;
                            dlg.OkButtonLabel = "اختيار هذا المجلد";
                            if (dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                            {
                                selectedFolder = dlg.SelectedPath;
                            }
                        }
                    });
                    folderThread.SetApartmentState(System.Threading.ApartmentState.STA);
                    folderThread.Start();
                    folderThread.Join();
                    response = BridgeResponse.Ok(request.Id, new { selectedFolder = selectedFolder, cancelled = string.IsNullOrEmpty(selectedFolder) });
                    return true;

                case "filePicker:getLocations":
                    var pickerLocations = GetFilePickerLocations();
                    response = BridgeResponse.Ok(request.Id, pickerLocations);
                    return true;

                case "filePicker:listDirectory":
                    string pickerDirPath = null;
                    string pickerExtFilter = null;
                    string pickerSearch = null;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null)
                        {
                            if (pObj["path"] != null) pickerDirPath = pObj["path"].ToString().Trim();
                            if (pObj["extension"] != null) pickerExtFilter = pObj["extension"].ToString().Trim();
                            if (pObj["search"] != null) pickerSearch = pObj["search"].ToString().Trim();
                        }
                        else
                        {
                            pickerDirPath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    var pickerDirResult = ListDirectorySafe(pickerDirPath, pickerExtFilter, pickerSearch);
                    response = BridgeResponse.Ok(request.Id, pickerDirResult);
                    return true;

                case "filePicker:scanPackages":
                    var pickerFoundPackages = ScanKnownLocationsForPackages();
                    response = BridgeResponse.Ok(request.Id, pickerFoundPackages);
                    return true;

                case "filePicker:createDirectory":
                    string newDirPath = null;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null && pObj["path"] != null)
                        {
                            newDirPath = pObj["path"].ToString().Trim();
                        }
                        else
                        {
                            newDirPath = request.Payload.ToString().Trim('"', ' ');
                        }
                    }
                    if (!string.IsNullOrEmpty(newDirPath))
                    {
                        try
                        {
                            if (!System.IO.Directory.Exists(newDirPath))
                            {
                                System.IO.Directory.CreateDirectory(newDirPath);
                            }
                            response = BridgeResponse.Ok(request.Id, new { success = true, path = newDirPath });
                            return true;
                        }
                        catch (Exception ex)
                        {
                            response = BridgeResponse.Fail(request.Id, "CREATE_DIR_FAILED", "تعذر إنشاء المجلد: " + ex.Message);
                            return true;
                        }
                    }
                    response = BridgeResponse.Fail(request.Id, "INVALID_PATH", "المسار المحدد غير صالح.");
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

                default:
                    return false;
            }
        }

        private static object GetFilePickerLocations()
        {
            var list = new System.Collections.Generic.List<object>();

            // 1. All ready drives
            try
            {
                var drives = System.IO.DriveInfo.GetDrives();
                foreach (var d in drives)
                {
                    try
                    {
                        if (d.IsReady)
                        {
                            bool isRemovable = d.DriveType == System.IO.DriveType.Removable;
                            string label = string.IsNullOrEmpty(d.VolumeLabel)
                                ? (isRemovable ? "فلاشة USB" : "قرص محلي")
                                : d.VolumeLabel;
                            list.Add(new
                            {
                                id = d.Name,
                                name = d.Name,
                                path = d.RootDirectory.FullName,
                                label = label,
                                isDrive = true,
                                isRemovable = isRemovable,
                                iconType = isRemovable ? "usb" : "drive",
                                freeSpaceBytes = d.AvailableFreeSpace,
                                totalSpaceBytes = d.TotalSize
                            });
                        }
                    }
                    catch
                    {
                        // Ignore individual drive probe failure
                    }
                }
            }
            catch
            {
                // Ignore system drives enumeration error
            }

            // 2. Special user folders
            try
            {
                string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (!string.IsNullOrEmpty(userProfile))
                {
                    string downloadsPath = System.IO.Path.Combine(userProfile, "Downloads");
                    if (System.IO.Directory.Exists(downloadsPath))
                    {
                        list.Add(new
                        {
                            id = "downloads",
                            name = "التنزيلات",
                            path = downloadsPath,
                            label = "مجلد التنزيلات (Downloads)",
                            isDrive = false,
                            isRemovable = false,
                            iconType = "downloads",
                            freeSpaceBytes = 0L,
                            totalSpaceBytes = 0L
                        });
                    }
                }

                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                if (!string.IsNullOrEmpty(desktopPath) && System.IO.Directory.Exists(desktopPath))
                {
                    list.Add(new
                    {
                        id = "desktop",
                        name = "سطح المكتب",
                        path = desktopPath,
                        label = "سطح المكتب (Desktop)",
                        isDrive = false,
                        isRemovable = false,
                        iconType = "desktop",
                        freeSpaceBytes = 0L,
                        totalSpaceBytes = 0L
                    });
                }

                string docsPath = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
                if (!string.IsNullOrEmpty(docsPath) && System.IO.Directory.Exists(docsPath))
                {
                    list.Add(new
                    {
                        id = "documents",
                        name = "المستندات",
                        path = docsPath,
                        label = "المستندات (Documents)",
                        isDrive = false,
                        isRemovable = false,
                        iconType = "folder",
                        freeSpaceBytes = 0L,
                        totalSpaceBytes = 0L
                    });
                }

                string backupFolder = DatabaseService.Settings != null ? DatabaseService.Settings.Get("backup_target_folder", "") : "";
                if (string.IsNullOrEmpty(backupFolder) && DatabaseService.Backup != null)
                {
                    backupFolder = DatabaseService.Backup.GetDefaultBackupFolder();
                }
                if (!string.IsNullOrEmpty(backupFolder) && System.IO.Directory.Exists(backupFolder))
                {
                    list.Add(new
                    {
                        id = "rafiq_backups",
                        name = "نسخ رفيق",
                        path = backupFolder,
                        label = "مجلد نسخ رفيق المعتمد",
                        isDrive = false,
                        isRemovable = false,
                        iconType = "archive",
                        freeSpaceBytes = 0L,
                        totalSpaceBytes = 0L
                    });
                }
            }
            catch
            {
                // Ignore special folders probe error
            }

            return list;
        }

        private static object ListDirectorySafe(string targetPath, string extensionFilter, string search)
        {
            if (string.IsNullOrEmpty(targetPath) || !System.IO.Directory.Exists(targetPath))
            {
                return new
                {
                    success = false,
                    message = "المجلد غير موجود أو تعذر الوصول إليه.",
                    currentPath = targetPath ?? "",
                    parentPath = (string)null,
                    folders = new object[0],
                    files = new object[0]
                };
            }

            try
            {
                var dirInfo = new System.IO.DirectoryInfo(targetPath);
                string parent = dirInfo.Parent != null ? dirInfo.Parent.FullName : null;

                var foldersList = new System.Collections.Generic.List<object>();
                try
                {
                    var subDirs = dirInfo.GetDirectories();
                    for (int i = 0; i < subDirs.Length; i++)
                    {
                        var d = subDirs[i];
                        if ((d.Attributes & (System.IO.FileAttributes.Hidden | System.IO.FileAttributes.System)) != 0)
                        {
                            continue;
                        }
                        if (!string.IsNullOrEmpty(search) && d.Name.IndexOf(search, StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            continue;
                        }
                        foldersList.Add(new
                        {
                            name = d.Name,
                            fullPath = d.FullName,
                            lastModified = d.LastWriteTimeUtc.ToString("o")
                        });
                    }
                }
                catch
                {
                    // Ignore folder enumeration failure (e.g. Access Denied on specific subfolders)
                }

                var filesList = new System.Collections.Generic.List<object>();
                try
                {
                    var files = dirInfo.GetFiles();
                    for (int i = 0; i < files.Length; i++)
                    {
                        var f = files[i];
                        if ((f.Attributes & (System.IO.FileAttributes.Hidden | System.IO.FileAttributes.System)) != 0)
                        {
                            continue;
                        }
                        if (!string.IsNullOrEmpty(extensionFilter) &&
                            !string.Equals(f.Extension, extensionFilter, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }
                        if (!string.IsNullOrEmpty(search) && f.Name.IndexOf(search, StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            continue;
                        }
                        filesList.Add(new
                        {
                            name = f.Name,
                            fullPath = f.FullName,
                            sizeBytes = f.Length,
                            lastModified = f.LastWriteTimeUtc.ToString("o"),
                            extension = f.Extension
                        });
                    }
                }
                catch
                {
                    // Ignore files enumeration failure
                }

                return new
                {
                    success = true,
                    currentPath = dirInfo.FullName,
                    parentPath = parent,
                    folders = foldersList,
                    files = filesList
                };
            }
            catch (Exception ex)
            {
                return new
                {
                    success = false,
                    message = "خطأ أثناء قراءة المجلد: " + ex.Message,
                    currentPath = targetPath,
                    parentPath = (string)null,
                    folders = new object[0],
                    files = new object[0]
                };
            }
        }

        private static object ScanKnownLocationsForPackages()
        {
            var packages = new System.Collections.Generic.List<object>();
            var scannedDirs = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var candidates = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, string>>();

            // 1. Removable drives
            try
            {
                var drives = System.IO.DriveInfo.GetDrives();
                foreach (var d in drives)
                {
                    if (d.IsReady && d.DriveType == System.IO.DriveType.Removable)
                    {
                        string lbl = string.IsNullOrEmpty(d.VolumeLabel) ? "فلاشة USB" : d.VolumeLabel;
                        candidates.Add(new System.Collections.Generic.KeyValuePair<string, string>(
                            d.RootDirectory.FullName,
                            string.Format("فلاشة ({0}) {1}", d.Name.TrimEnd('\\'), lbl)));
                    }
                }
            }
            catch { }

            // 2. Downloads
            try
            {
                string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (!string.IsNullOrEmpty(userProfile))
                {
                    string dl = System.IO.Path.Combine(userProfile, "Downloads");
                    if (System.IO.Directory.Exists(dl))
                    {
                        candidates.Add(new System.Collections.Generic.KeyValuePair<string, string>(dl, "مجلد التنزيلات (Downloads)"));
                    }
                }
            }
            catch { }

            // 3. Desktop
            try
            {
                string dt = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                if (!string.IsNullOrEmpty(dt) && System.IO.Directory.Exists(dt))
                {
                    candidates.Add(new System.Collections.Generic.KeyValuePair<string, string>(dt, "سطح المكتب (Desktop)"));
                }
            }
            catch { }

            // 4. Default Backups folder
            try
            {
                string bk = DatabaseService.Settings != null ? DatabaseService.Settings.Get("backup_target_folder", "") : "";
                if (string.IsNullOrEmpty(bk) && DatabaseService.Backup != null)
                {
                    bk = DatabaseService.Backup.GetDefaultBackupFolder();
                }
                if (!string.IsNullOrEmpty(bk) && System.IO.Directory.Exists(bk))
                {
                    candidates.Add(new System.Collections.Generic.KeyValuePair<string, string>(bk, "مجلد نسخ رفيق"));
                }
            }
            catch { }

            for (int i = 0; i < candidates.Count; i++)
            {
                string rootDir = candidates[i].Key;
                string locLabel = candidates[i].Value;

                if (scannedDirs.Contains(rootDir)) continue;
                scannedDirs.Add(rootDir);

                ScanFolderForPackages(rootDir, locLabel, packages, 0, 1);
            }

            return packages;
        }

        private static void ScanFolderForPackages(string dirPath, string locLabel, System.Collections.Generic.List<object> results, int currentDepth, int maxDepth)
        {
            if (string.IsNullOrEmpty(dirPath) || !System.IO.Directory.Exists(dirPath)) return;

            try
            {
                var dir = new System.IO.DirectoryInfo(dirPath);
                var files = dir.GetFiles("*.rafiqpkg");
                for (int i = 0; i < files.Length; i++)
                {
                    var f = files[i];
                    results.Add(new
                    {
                        name = f.Name,
                        fullPath = f.FullName,
                        sizeBytes = f.Length,
                        lastModified = f.LastWriteTimeUtc.ToString("o"),
                        locationLabel = locLabel
                    });
                }

                if (currentDepth < maxDepth)
                {
                    var subDirs = dir.GetDirectories();
                    for (int j = 0; j < subDirs.Length; j++)
                    {
                        var s = subDirs[j];
                        if ((s.Attributes & (System.IO.FileAttributes.Hidden | System.IO.FileAttributes.System)) != 0)
                        {
                            continue;
                        }
                        string sName = s.Name.ToLowerInvariant();
                        if (sName == "windows" || sName == "program files" || sName == "$recycle.bin" || sName == "system volume information")
                        {
                            continue;
                        }
                        ScanFolderForPackages(s.FullName, locLabel, results, currentDepth + 1, maxDepth);
                    }
                }
            }
            catch { }
        }
    }
}
