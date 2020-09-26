$ErrorActionPreference = "Stop"

$notificationTitle = "Breathe Reminder"
$notificationSub = "Take a deep breath 😌"

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastImageAndText02)

#Convert to .NET type for XML manipuration
$toastXml = [xml] $template.GetXml()

$toastNode = $toastXml.SelectSingleNode("/toast")

$toastAudio = $toastXml.createElement("audio")

$toastAudio.setAttribute("src", "ms-winsoundevent:Notification.Reminder")
$toastAudio.setAttribute("loop", "false")

$toastNode.AppendChild($toastAudio)

$toastImg = $toastXml.GetElementsByTagName("image")
$toastTexts = $toastXml.GetElementsByTagName("text")

$toastImg[0].setAttribute("src", "file://$PWD/logo512.png")
$toastTexts[0].AppendChild($toastXml.CreateTextNode($notificationTitle)) > $null
$toastTexts[1].AppendChild($toastXml.CreateTextNode($notificationSub)) > $null

Format-Xml -InputObject $toastXml

#Convert back to WinRT type
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($toastXml.OuterXml)

$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.Tag = "Breathe"
$toast.Group = "Breathe"
$toast.ExpirationTime = [DateTimeOffset]::Now.AddMinutes(5)
#$toast.SuppressPopup = $true

$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Breathe")
$notifier.Show($toast);