import { createApp } from 'vue';
import { createPinia } from 'pinia';
import StudioApp from './studio/StudioApp.vue';
import './styles/main.css';
import './studio/studio.css';

createApp(StudioApp).use(createPinia()).mount('#app');
