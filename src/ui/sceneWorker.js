// src/ui/sceneWorker.js
import '@babel/polyfill';

import * as pickler from '../common/pickler';
import { handlers } from './handlers';


onmessage = event => {
  const { id, input: { cmd, val } } = pickler.unpickle(event.data);
  const log = text => postMessage(pickler.pickle({
    id, output: text, status: 'log'
  }));

  let output, status;

  try {
    console.log(`Worker received command: ${cmd}`);
    output = handlers[cmd](val, log);
    status = 'success';
  } catch (ex) {
    output = `${ex}\n${ex.stack}`;
    status = 'error';
  }

  postMessage(pickler.pickle({ id, output, status }));
};
