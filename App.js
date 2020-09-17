import React, { Component } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
import { Checkbox } from '@fluentui/react-native';

class ToDoList extends Component {

  constructor(props) {
    super(props);
    this.state = { loading: true, todos: [] };
  }

  async componentDidMount() {
    this.setState({ loading: true });
    var result = await fetch("https://jsonplaceholder.typicode.com/todos");
    var json = await result.json();

    this.setState({ todos: json, loading: false });
  }

  render() {
    return (
      <View>
        <ActivityIndicator size="large" animating={this.state.loading} />
        <FlatList data={this.state.todos} renderItem={
          ({ item }) => <View>
            <Checkbox label={item.title} />
          </View>}
        />
      </View>
    );
  }
}

export default ToDoList