import React from 'react';
import PropTypes from 'prop-types';
import { Popover } from 'react-tiny-popover';
const { setTimeout, clearTimeout } = window;

// react-tiny-popover 3 -> 8: the v3 defaults this component relied on are now
// explicit. v3 tried the requested position first and then the remaining ones
// (top, right, left, bottom order), padded the popover 6px from the target and
// kept it 6px inside the window, and clipped (overflow: hidden) the container,
// which also makes it contain the floated avatar. v8 defaults are 0px, 0px and
// overflow: visible.
const POPOVER_POSITIONS = ['bottom', 'top', 'right', 'left'];
const POPOVER_PADDING = 6;
const POPOVER_BOUNDARY_INSET = 6;
const POPOVER_CONTAINER_STYLE = { overflow: 'hidden' };

export default class ItemPopover extends React.Component {
  static propTypes = {
    item: PropTypes.object.isRequired,
    isSelected: PropTypes.bool,
  };

  static defaultProps = {
    isSelected: false,
  };

  state = {
    isHover: false,
  };

  componentWillUnmount() {
    this.onLeave();
  }

  onEnter() {
    this.timeout = setTimeout(() => {
      this.setState({ isHover: true });
    }, 500);
  }

  onLeave() {
    clearTimeout(this.timeout);
    this.setState({ isHover: false });
  }

  render() {
    const { item, isSelected, children } = this.props;
    const { isHover } = this.state;

    return (
      <Popover
        isOpen={isHover}
        containerClassName="ItemPopover bg-light-gray black"
        positions={POPOVER_POSITIONS}
        align="start"
        padding={POPOVER_PADDING}
        boundaryInset={POPOVER_BOUNDARY_INSET}
        containerStyle={POPOVER_CONTAINER_STYLE}
        content={
          <div>
            <div className="fl w3 h3 ma1 relative avatar">
              <img className="absolute" src="avatars/parts/body.png" />
              <img className="absolute" src={item.layerPath} />
            </div>
            <h4 className="ma0">{item.displayName}</h4>
            <p className="mb0 item-description"
              dangerouslySetInnerHTML={{ __html: item.description }}>
            </p>
          </div>
        }
      >
        <div
          onMouseEnter={this.onEnter.bind(this)}
          onMouseLeave={this.onLeave.bind(this)}
          className={isSelected ? 'ba bw2 b--green' : 'pa1'}
        >
          {children}
        </div>
      </Popover>
    );
  }
}
