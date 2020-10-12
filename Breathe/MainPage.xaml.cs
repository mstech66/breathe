using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Foundation;
using Windows.Foundation.Collections;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Controls.Primitives;
using Windows.UI.Xaml.Data;
using Windows.UI.Xaml.Input;
using Windows.UI.Xaml.Media;
using Windows.UI.Xaml.Navigation;
using Windows.UI.Notifications;
using Microsoft.Toolkit.Uwp.Notifications;

// The Blank Page item template is documented at https://go.microsoft.com/fwlink/?LinkId=402352&clcid=0x409

namespace Breathe
{
    /// <summary>
    /// An empty page that can be used on its own or navigated to within a Frame.
    /// </summary>
    public sealed partial class MainPage : Page
    {
        private object[] minutesArray = new object[] { "20 Minutes", "40 Minutes", "60 Minutes", "80 Minutes", "100 Minutes" };
        public MainPage()
        {
            this.InitializeComponent();
            foreach (object element in minutesArray)
            {
                this.TimePickup.Items.Add(element);
            }
            this.webView.Source = new Uri("ms-appx-web:///breathe.html");
        }

        private void generateToast(String title, String content)
        {
            String image = "ms-appx:///Assets/react.png";
            var toastContent = new ToastContent()
            {
                Visual = new ToastVisual()
                {
                    BindingGeneric = new ToastBindingGeneric()
                    {
                        Children =
                        {
                            new AdaptiveText()
                            {
                                Text = title
                            },
                            new AdaptiveText()
                            {
                                Text = content
                            }
                        },
                        AppLogoOverride = new ToastGenericAppLogo()
                        {
                            Source = image,
                            HintCrop = ToastGenericAppLogoCrop.Circle
                        }
                    }
                }
            };
            var toast = new ToastNotification(toastContent.GetXml());
            ToastNotificationManager.CreateToastNotifier().Show(toast);
        }

        private void StopRemindersButton_Click(object sender, RoutedEventArgs e)
        {
            generateToast("Breathe Reminder", "Take a deep breath");
        }

        private void TimePickup_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            var selectedValue = this.TimePickup.SelectedValue;
            generateToast("Breathe", $"Reminder set for {selectedValue}");
        }
    }
}
