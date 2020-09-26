import React, { Component } from 'react';
import './App.css';
import { DefaultButton, initializeIcons } from '@fluentui/react';

function showNotification() {
  new Notification("Breathe Reminder", {
    body: "Time to take deep breaths"
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
