import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PlayerApp from './PlayerApp.vue';
import '../styles/main.css';

createApp(PlayerApp).use(createPinia()).mount('#app');
