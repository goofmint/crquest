import React from 'react';
import PropTypes from 'prop-types';
import ejs from 'ejs';
import { Converter } from 'showdown';
import showdownHighlight from 'showdown-highlight';
import { Trans } from 'react-i18next';
import ItemPopover from '../../ItemPopover';
import { context, setContext } from '../../../common/context';
import Button from '../../Button';
import ButtonBar from '../../ButtonBar';
import { achievedNewRank } from '../../../common/rank';
import { readLocalizedFile, resolveAbsolutePath } from '../../../common/assetLoader';
import { t } from '../../../i18n';

// Configure our markdown parser
const MD = new Converter({
  openLinksInNewWindow: true,
  extensions: [showdownHighlight],
});
MD.setFlavor('github');

const ItemIcon = ({ item }) => {
  return (
    <img
      style={{
        width: '64px',
        imageRendering: 'pixelated',
      }}
      className="self-center"
      src={item.iconPath}
    />
  );
};

export default class ObjectiveDescription extends React.Component {
  static propTypes = {
    objective: PropTypes.object.isRequired,
    cleared: PropTypes.bool,
    newEnvVars: PropTypes.array,
  };

  static defaultProps = {
    newEnvVars: [],
  };

  static contextType = context;

  state = {
    selectedIndex: 0, // the currently visible tab
    descriptionHtml: '', // HTML for objective description
    walkthroughHtml: '', // HTML for objective walkthrough
  };

  async componentDidMount() {
    const renderMd = async filePath => {
      const mdRaw = await readLocalizedFile(filePath);

      let mdEvaluated = mdRaw;
      try {
        mdEvaluated = await ejs.render(
          mdRaw,
          {
            env: this.context.env,
            levelState: this.context.levelState,
            context: this.context,
            resolveAbsolutePath,
            formatPathPartsForOs: (...parts) => {
              const { systemInfo } = this.context;
              if (systemInfo && systemInfo.os === 'win32') {
                return parts.join('\\');
              }

              return parts.join('/');
            },
          },
          { async: true }
        );
      } catch (e) {
        console.warn(`Error rendering EJS template logic, skipping...`);
        console.warn(e);
      }
      const html = MD.makeHtml(mdEvaluated);
      return html;
    };

    // Load markdown description from the filesystem for display
    const descMd = `${this.props.objective.objectivePath}/description.md`;
    const walkMd = `${this.props.objective.objectivePath}/walkthrough.md`;
    const descriptionHtml = await renderMd(descMd);
    const walkthroughHtml = await renderMd(walkMd);

    this.setState({ descriptionHtml, walkthroughHtml });
  }

  renderRewards() {
    if (!this.props.objective.rewards) return null;

    const { xp, items } = this.props.objective.rewards;
    const rewards = [];
    if (xp) {
      rewards.push(
        <div className="reward" key="xp">
          {t('ui.objectiveDescription.xp', { xp })}
        </div>
      );
    }

    if (items && items.length) {
      items
        .map(item => this.context.items[item])
        .forEach(item => {
          rewards.push(
            <div className="reward" key={item.name}>
              <ItemPopover item={item}>
                <div className="flex flex-column">
                  <ItemIcon item={item} />
                  <span className="item-desc">{item.displayName}</span>
                </div>
              </ItemPopover>
            </div>
          );
        });
    }

    return (
      <div className="mission-intro mw9">
        <h3>{t('ui.objectiveDescription.reward')}</h3>
        <div className="reward-list flex items-center justify-around pa2">
          {rewards}
        </div>
      </div>
    );
  }

  renderOverview() {
    return (
      <div className="description-content overview">
        {this.renderRewards()}
        <div className="objective-description-text">
          <span
            dangerouslySetInnerHTML={{
              __html: this.props.objective.description,
            }}
          ></span>
          <div className="cta-button">
            <Button
              label={t('ui.objectiveDescription.begin')}
              onClick={() => this.setState({ selectedIndex: 1 })}
            />
          </div>
        </div>
      </div>
    );
  }

  renderObjective() {
    return (
      <div className="description-content">
        <div
          className="objective-inner objective"
          dangerouslySetInnerHTML={{ __html: this.state.descriptionHtml }}
        />
        <div className="cta-button">
          <Button
            label={t('ui.objectiveDescription.showHelp')}
            onClick={() => this.setState({ selectedIndex: 2 })}
          />
        </div>
      </div>
    );
  }

  renderWalkthrough() {
    return (
      <div className="description-content">
        <div
          className=" objective-inner walkthrough"
          dangerouslySetInnerHTML={{ __html: this.state.walkthroughHtml }}
        />
        <div className="objective-inner walkthrough">
          <h2>{t('ui.objectiveDescription.helpHeading')}</h2>
          <p>
            <Trans
              i18nKey="ui.objectiveDescription.helpLink"
              components={{ community: <a href="https://terminal.quest" /> }}
            />
          </p>
        </div>
      </div>
    );
  }

  renderObjectiveCleared() {
    const { objective, newEnvVars } = this.props;

    const newRank = achievedNewRank(
      Object.keys(this.context.completedObjectives).length,
      this.context.numObjectives
    );

    return (
      <div className="objective-cleared pa3 tc">
        <div className="shield">
          <img src="images/app/shield.png" alt={t('ui.objectiveDescription.shield')} />
        </div>

        <h2>{t('ui.objectiveDescription.clear')}</h2>

        {objective.rewards.xp && (
          <div className="mt4">
            <strong>
              <Trans i18nKey="ui.objectiveDescription.xpEarned" values={{ xp: objective.rewards.xp }} />
            </strong>
          </div>
        )}

        {newRank && (
          <div className="mt4">
            <strong>
              <Trans i18nKey="ui.objectiveDescription.rankReached" values={{ rank: newRank }} />
            </strong>
          </div>
        )}

        {objective.rewards.items && !!objective.rewards.items.length && (
          <div className="mt4">
            <strong>{t('ui.objectiveDescription.itemsAwarded')}</strong>

            <div className="flex items-center justify-around mb3">
              {objective.rewards.items
                .map(item => this.context.items[item])
                .map(item => {
                  return (
                    <div className="flex flex-column reward" key={item.name}>
                      <ItemIcon item={item} />
                      <span className="item-desc">{item.displayName}</span>
                    </div>
                  );
                })}
            </div>

            <a
              onClick={() => {
                setContext({
                  currentMenu: { name: 'inventory' },
                });
              }}
            >
              {t('ui.objectiveDescription.viewInventory')}
            </a>
          </div>
        )}

        {!!newEnvVars.length && (
          <div className="mt4">
            <strong>{t('ui.objectiveDescription.variablesUnlocked')}</strong>

            <div className="mt3 mb3">
              {newEnvVars.map(envVar => (
                <div key={envVar.name}>{envVar.name}</div>
              ))}
            </div>

            <a
              onClick={() => {
                setContext({
                  currentMenu: { name: 'settings', subnav: 'Variables' },
                });
              }}
            >
              {t('ui.objectiveDescription.viewSettings')}
            </a>
          </div>
        )}
      </div>
    );
  }

  render() {
    const buttonLabels = ['overview', 'objective', 'help'].map(tab =>
      t(`ui.objectiveDescription.${tab}`)
    );
    const { cleared } = this.props;

    return (
      <div className="ObjectiveDescription">
        {!cleared ? (
          <div className="button-tabs">
            <ButtonBar
              buttonLabels={buttonLabels}
              selectedIndex={this.state.selectedIndex}
              onClick={index => this.setState({ selectedIndex: index })}
            />
          </div>
        ) : (
          this.renderObjectiveCleared()
        )}

        {!cleared && this.state.selectedIndex === 0 && this.renderOverview()}
        {!cleared && this.state.selectedIndex === 1 && this.renderObjective()}
        {!cleared && this.state.selectedIndex === 2 && this.renderWalkthrough()}
      </div>
    );
  }
}
