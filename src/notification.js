function showNotification() {
    new Notification("Breathe", {
        title: "Breathe",
        body: "Take a deep breath 😌",
        icon: '../build/logo512.png'
    });
}

showNotification();