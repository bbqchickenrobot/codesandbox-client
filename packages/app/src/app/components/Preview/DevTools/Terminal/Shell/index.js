// @flow
import React from 'react';
import { listen, dispatch } from 'codesandbox-api';
import { withTheme } from 'styled-components';
import { Terminal } from 'xterm';
import { debounce } from 'lodash';
import * as fit from 'xterm/lib/addons/fit/fit';

import getTerminalTheme from '../terminal-theme';

type Props = {
  id: string,
  theme: any,
  script: ?string,
  closeShell: () => void,
  endShell: () => void,
  ended: boolean,
  hidden: boolean,
  height: number,
  updateStatus?: (type: string, count?: number) => void,
};

Terminal.applyAddon(fit);
class Shell extends React.PureComponent<Props> {
  listener: Function;
  term: Terminal;
  node: ?HTMLDivElement;

  componentDidMount() {
    // TODO: deduplicate all this by making this a general API that can be used
    // to show the results of npm commands as well as the results of shell
    this.term = new Terminal();
    this.term.open(this.node);

    this.term.setOption('theme', getTerminalTheme(this.props.theme));
    this.term.setOption('fontFamily', 'Source Code Pro');
    this.term.setOption('fontWeight', 'normal');
    this.term.setOption('fontWeightBold', 'bold');
    this.term.setOption('lineHeight', 1.3);
    this.term.setOption('fontSize', 14);

    this.term.on('data', data => {
      if (!this.props.ended) {
        dispatch({
          type: 'socket:message',
          channel: 'shell:in',
          id: this.props.id,
          data,
        });
      }
    });

    this.listener = listen(this.handleMessage);

    this.sendResize = debounce(this.sendResize, 100);

    this.term.on('resize', ({ cols, rows }) => {
      this.sendResize(cols, rows);
    });
    this.term.fit();
    dispatch({
      type: 'socket:message',
      channel: 'shell:start',
      id: this.props.id,
      cols: this.term.cols,
      rows: this.term.rows,
      script: this.props.script,
    });

    window.addEventListener('resize', this.listenForResize);

    this.term.focus();
  }

  sendResize = (cols: number, rows: number) => {
    if (this.props.ended) {
      dispatch({
        type: 'socket:message',
        channel: 'shell:resize',
        cols,
        rows,
        id: this.props.id,
      });
    }
  };

  componentDidUpdate(prevProps: Props) {
    if (prevProps.height !== this.props.height) {
      this.term.fit();
    }

    if (prevProps.hidden !== this.props.hidden && !this.props.hidden) {
      this.term.focus();
    }

    if (prevProps.theme !== this.props.theme) {
      this.term.setOption('theme', getTerminalTheme(this.props.theme));
    }
  }

  listenForResize = () => {
    this.term.fit();
  };

  handleMessage = (data: any) => {
    if (data.id === this.props.id) {
      if (data.type === 'shell:out' && !this.props.ended) {
        this.term.write(data.data);

        if (this.props.updateStatus) {
          this.props.updateStatus('info');
        }
      } else if (data.type === 'shell:exit') {
        if (!this.props.script) {
          setTimeout(() => {
            this.props.closeShell();
          }, 300);
        } else {
          this.props.endShell();

          this.term.write(`\n\rSession finished with status code ${data.code}`);
        }
      }
    }
  };

  componentWillUnmount() {
    this.listener();

    window.removeEventListener('resize', this.listenForResize);

    dispatch({
      type: 'socket:message',
      channel: 'shell:close',
      id: this.props.id,
    });
  }

  render() {
    const { height, hidden } = this.props;

    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          height: height - 72,
          padding: '.5rem',
          visibility: hidden ? 'hidden' : 'visible',
        }}
        ref={node => {
          this.node = node;
        }}
      />
    );
  }
}

export default withTheme(Shell);
