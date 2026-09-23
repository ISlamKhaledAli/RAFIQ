Add-Type -AssemblyName System.Drawing

$srcPath = "c:\Users\khale\OneDrive\Desktop\RAFIQ\branding\concept_2_corporate_swiss.jpg"
$img = [System.Drawing.Image]::FromFile($srcPath)

# 1. Save PNG
$pngPath = "c:\Users\khale\OneDrive\Desktop\RAFIQ\branding\logo.png"
$img.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# 2. Copy to Frontend
Copy-Item $pngPath "c:\Users\khale\OneDrive\Desktop\RAFIQ\frontend\public\logo.png" -Force

# 3. Create high-quality 256x256 bitmap for ICO
$bmp = New-Object System.Drawing.Bitmap(256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($img, 0, 0, 256, 256)
$g.Dispose()

# 4. Save ICO
$hIcon = $bmp.GetHicon()
$ico = [System.Drawing.Icon]::FromHandle($hIcon)
$icoStream = [System.IO.File]::OpenWrite("c:\Users\khale\OneDrive\Desktop\RAFIQ\branding\app.ico")
$ico.Save($icoStream)
$icoStream.Close()

# 5. Distribute ICO to desktop, installer, and frontend
Copy-Item "c:\Users\khale\OneDrive\Desktop\RAFIQ\branding\app.ico" "c:\Users\khale\OneDrive\Desktop\RAFIQ\desktop\app.ico" -Force
Copy-Item "c:\Users\khale\OneDrive\Desktop\RAFIQ\branding\app.ico" "c:\Users\khale\OneDrive\Desktop\RAFIQ\installer\app.ico" -Force
Copy-Item "c:\Users\khale\OneDrive\Desktop\RAFIQ\branding\app.ico" "c:\Users\khale\OneDrive\Desktop\RAFIQ\frontend\public\favicon.ico" -Force

$img.Dispose()
$bmp.Dispose()
Write-Output "SUCCESS: Assets deployed across RAFIQ project."
