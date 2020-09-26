import React, { Component } from 'react';
import './App.css';
import { DefaultButton, initializeIcons } from '@fluentui/react';

function showNotification() {
  new Notification("Breathe Reminder", {
    body: "Time to take deep breaths",
    icon: '../build/logo512.png'
  })
}

class App extends Component {

  constructor(props) {
    super(props);
    initializeIcons()
  }

  render() {
    return (
      <div className='jumbotron'>
        <DefaultButton text="Show Notification" onClick={showNotification} />
      </div>
    )
  }
}

export default App;
