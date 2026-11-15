import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import SplitterLayout from 'react-splitter-layout';

// react-splitter-layout 3.0.1 (last 3.x; declares react ^15 || ^16 as peer
// dependency) is kept on React 19: it uses only class components, callback
// refs without return values and no findDOMNode. This renders it the way
// QuestIDE does and drives the splitter with the mouse in the real engine.
function renderLikeQuestIDE(onSizeChange) {
  return render(
    <div style={{ position: 'relative', width: '400px', height: '500px' }}>
      <SplitterLayout
        vertical={true}
        percentage={true}
        secondaryInitialSize={30}
        customClassName="splitter"
        onSecondaryPaneSizeChange={onSizeChange}
      >
        <div className="code-editor" id="code-editor" />
        <div className="console" id="console" />
      </SplitterLayout>
    </div>
  );
}

describe('react-splitter-layout on React 19', () => {
  afterEach(() => vi.restoreAllMocks());

  test('renders both panes and a separator with the injected styles', () => {
    const { container } = renderLikeQuestIDE(vi.fn());
    const layout = container.querySelector('.splitter-layout');
    expect(layout).toHaveClass('splitter', 'splitter-layout-vertical');
    expect(container.querySelector('#code-editor')).toBeInTheDocument();
    expect(container.querySelector('#console')).toBeInTheDocument();
    const separator = container.querySelector('[role="separator"]');
    expect(separator).toHaveClass('layout-splitter');
    expect(getComputedStyle(layout).flexDirection).toBe('column');
    expect(getComputedStyle(separator).height).toBe('4px');
  });

  test('starts at the initial secondary size and reports it', () => {
    const onSizeChange = vi.fn();
    const { container } = renderLikeQuestIDE(onSizeChange);
    const consolePane = container.querySelector('#console').parentElement;
    expect(consolePane.style.height).toBe('30%');
    expect(onSizeChange).toHaveBeenCalledWith(30);
  });

  test('dragging the separator resizes the secondary pane', () => {
    // jsdom does not lay elements out (every rect is 0x0), so give the layout
    // the geometry from renderLikeQuestIDE (400x500 with a 4px splitter);
    // the splitter's own drag arithmetic is what is under test.
    const rectOf = (width, height) => ({
      left: 0, top: 0, right: width, bottom: height, x: 0, y: 0, width, height,
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function () {
        if (this.classList.contains('splitter-layout')) return rectOf(400, 500);
        if (this.getAttribute('role') === 'separator') return rectOf(400, 4);
        return rectOf(0, 0);
      }
    );
    const onSizeChange = vi.fn();
    const { container } = renderLikeQuestIDE(onSizeChange);
    const consolePane = container.querySelector('#console').parentElement;
    const separator = container.querySelector('[role="separator"]');
    const rect = container.querySelector('.splitter-layout').getBoundingClientRect();

    fireEvent.mouseDown(separator);
    expect(container.querySelector('.splitter-layout')).toHaveClass('layout-changing');
    // Move the splitter to the vertical middle of the layout
    fireEvent.mouseMove(document, { clientX: rect.left + 10, clientY: rect.top + rect.height / 2 });
    fireEvent.mouseUp(document);

    expect(container.querySelector('.splitter-layout')).not.toHaveClass('layout-changing');
    const percent = parseFloat(consolePane.style.height);
    expect(percent).toBeGreaterThan(45);
    expect(percent).toBeLessThan(55);
    expect(onSizeChange).toHaveBeenLastCalledWith(percent);
  });
});
