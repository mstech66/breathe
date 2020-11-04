using System;
using Windows.ApplicationModel.AppService;
using Windows.ApplicationModel.Background;
using Windows.Foundation.Collections;
using Windows.UI.Notifications;
using Microsoft.Toolkit.Uwp.Notifications;
using System.Timers;

namespace BreatheService
{
    public sealed class BreatheServ : IBackgroundTask
    {
        private Timer _timer;
        private BackgroundTaskDeferral backgroundTaskDeferral;
        private AppServiceConnection appServiceconnection;

        public void Run(IBackgroundTaskInstance taskInstance)
        {
            this.backgroundTaskDeferral = taskInstance.GetDeferral();

            taskInstance.Canceled += OnTaskCanceled;

            var details = taskInstance.TriggerDetails as AppServiceTriggerDetails;
            appServiceconnection = details.AppServiceConnection;
            appServiceconnection.RequestReceived += OnRequestReceived;
        }

        private async void OnRequestReceived(AppServiceConnection sender, AppServiceRequestReceivedEventArgs args)
        {
            var messageDeferral = args.GetDeferral();

            ValueSet message = args.Request.Message;
            ValueSet returnData = new ValueSet();


            int? timeOut = message["timeOut"] as int?;
            int minutes = timeOut ?? default(int);
            if (minutes >= 0)
            {
                returnData.Add("Status", "OK");
            }
            SetTimer(minutes);

            try
            {
                await args.Request.SendResponseAsync(returnData);
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
            finally
            {
                messageDeferral.Complete();
            }
        }

        private void SetTimer(int minute)
        {
            _timer = new Timer(minute * 60 * 1000);

            _timer.Elapsed += OnTimedEvent;
            _timer.AutoReset = true;
            _timer.Enabled = true;
        }

        private void OnTimedEvent(object sender, ElapsedEventArgs e)
        {
            generateToast("Breathe Reminder", "Take a deep breath");
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

        private void OnTaskCanceled(IBackgroundTaskInstance sender, BackgroundTaskCancellationReason reason)
        {
            if (this.backgroundTaskDeferral != null)
            {
                // Complete the service deferral.
                this.backgroundTaskDeferral.Complete();
            }
        }
    }
}
