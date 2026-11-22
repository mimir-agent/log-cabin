import { addNav } from './nav';
import { chat } from './strings/chat';

addNav({ href: '/chat', label: chat.nav.chat, icon: 'chat-bubble', order: 12, tab: true });
