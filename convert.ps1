Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\Users\deniz\Desktop\.all\Projects\The Project Extension\icon.jpg")
$img.Save("C:\Users\deniz\Desktop\.all\Projects\The Project Extension\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
