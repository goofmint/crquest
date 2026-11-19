import React from 'react';
import { useTranslation, withTranslation } from 'react-i18next';
import styled from 'styled-components';
import { colors } from '../../common/styles';
import ga from '../../common/analytics';
import { getContext, emitter } from '../../common/context';
import levelLoader from '../../common/levelLoader';

const _QuestList = styled.div`
  font-size: 14px;
  margin-top: 20px;
`;

const Quest = styled.div`
  border: 1px solid ${colors.lightBlue};
  padding: 5px 20px;
  width: 100%;
  margin-bottom: 30px;
  position: relative;

  h5 {
    position: absolute;
    top: -10px;
    left: 20px;
    color: ${colors.lightBlue};
    margin: 0;
    background-color: ${colors.darkBlue};
    padding: 5px;
  }

  h6 {
    font-size: 14px;
    color: ${colors.yellow};
    margin: 20px 0 10px 0;
  }

  p {
    font-size: 16px;
  }
`;

function QuestList({ quests }) {
  const { t } = useTranslation();
  const questList = [];

  quests.forEach(quest => {
    questList.push(
      <Quest key={quest.levelInfo.levelName}>
        <h5>{quest.levelInfo.title}</h5>
        <h6>{quest.status.title}</h6>
        <p>{quest.status.description}</p>
      </Quest>
    );
  })
  return (
    <_QuestList>
      { questList.length > 0 ? 
        questList : 
        <small>{t('ui.journal.empty')}</small>
      }
    </_QuestList>
  );
}

class Journal extends React.Component {
  state = {
    activeQuests: [],
    completedQuests: []
  }

  componentDidMount() {
    ga.pageview('/menu/journal', 'Journal Screen');
    this.processQuestStatus();

    emitter.on('contextUpdate:questStatus', this.processQuestStatus);
  }

  componentWillUnmount() {
    emitter.off('contextUpdate:questStatus', this.processQuestStatus);
  }

  async processQuestStatus() {
    const questStatus = getContext('questStatus');
    const statuses = Object.keys(questStatus);
    const activeQuests = [];
    const completedQuests = [];

    for (let i = 0, l = statuses.length; i<l; i++) {
      try {
        const levelName = statuses[i];
        const status = questStatus[levelName];
        const levelInfo = await levelLoader.readLevelInfo(levelName);
        if (status.complete) {
          completedQuests.push({ status, levelInfo });
        } else {
          activeQuests.push({ status, levelInfo });
        }
      } catch(e) {
        // no op - if there isn't level info for the given key, skip.
      }
    }

    this.setState({ activeQuests, completedQuests });
  }

  render() {
    const { t } = this.props;
    return (
      <div className="Journal">
        <section className="journal-inner">
          <h1>{t('ui.journal.title')}</h1>
          <h2>{t('ui.journal.active')}</h2>
          <QuestList quests={this.state.activeQuests}/>
          <h2 style={{ color: colors.lightBlue, marginTop: '50px' }}>
            {t('ui.journal.completed')}
          </h2>
          <QuestList quests={this.state.completedQuests}/>
        </section>
      </div>
    );
  }
}

export default withTranslation(undefined)(Journal);
