import React from 'react';
import {createRoot} from 'react-dom/client';
import VeriStepApp from './VeriStepApp';
import './styles.css';
import './workspace.css';
import './redesign.css';
import './v2.css';
import './veristep.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><VeriStepApp/></React.StrictMode>);
