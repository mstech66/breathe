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
using Windows.ApplicationModel.AppService;
using BreatheService;
using System.Diagnostics;
using Windows.ApplicationModel.Background;
using Windows.UI.Popups;

// The Blank Page item template is documented at https://go.microsoft.com/fwlink/?LinkId=402352&clcid=0x409

namespace Breathe
{
    /// <summary>
    /// An empty page that can be used on its own or navigated to within a Frame.
    /// </summary>
    public sealed partial class MainPage : Page
    {
        private object[] minutesArray = new object[] { "15 Minutes", "20 Minutes", "30 Minutes", "40 Minutes", "60 Minutes", "80 Minutes", "100 Minutes" };
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
            cancelTask();
        }

        private void TimePickup_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            String selectedValue = this.TimePickup.SelectedValue.ToString();
            string[] splitValues = selectedValue.Split(" ");
            UInt32 minutes = UInt32.Parse(splitValues[0]);
            executeService(minutes);
        }

        private async void executeService(UInt32 selectedValue)
        {
            var taskName = "BreatheTask";
            var taskRegistered = false;

            foreach (var task in BackgroundTaskRegistration.AllTasks)
            {
                if (task.Value.Name == taskName)
                {
                    taskRegistered = true;
                    break;
                }
            }

            if (!taskRegistered)
            {
                var builder = new BackgroundTaskBuilder();
                builder.Name = taskName;
                builder.TaskEntryPoint = "BreatheService.BreatheTask";
                builder.SetTrigger(new TimeTrigger(selectedValue, false));

                await BackgroundExecutionManager.RequestAccessAsync();

                BackgroundTaskRegistration task = builder.Register();

                MessageDialog msg = new MessageDialog("Reminder Set Successfully!");
                await msg.ShowAsync();
            }
        }

        private async void cancelTask()
        {
            var taskName = "BreatheTask";

            foreach (var task in BackgroundTaskRegistration.AllTasks)
            {
                if (task.Value.Name == taskName)
                {
                    task.Value.Unregister(true);
                    MessageDialog msg = new MessageDialog("Reminder Removed Successfully!");
                    await msg.ShowAsync();
                }
            }
        }
    }
}
