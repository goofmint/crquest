import React from 'react';
import { useTranslation } from 'react-i18next';

export default function Credits() {
  const { t } = useTranslation();
  return (
    <div className="Credits">
      <div className="fl w-60">
        <h3>{t('ui.credits.team')}</h3>
        <p>
          <a href="https://twitter.com/kevinwhinnery">Kevin Whinnery</a>
        </p>
        <p>
          <a href="https://twitter.com/KerrieLake">Kerrie Lake</a>
        </p>

        <br/>

        <h3>{t('ui.credits.artwork')}</h3>
        <p>
          Kerrie Lake
        </p>
        <p>
          Nathan Sharp
        </p>
        <p>
          Kevin Whinnery
        </p>

        <br/>

        <h3>{t('ui.credits.soundtrack')}</h3>
        <p>
          Dino Lionetti
        </p>
        <p>
          Robby Vocke
        </p>
        <p>
          Ms. Joey Michalina Mariano
        </p>
        <p>
          Steve "ap0c" Lakawicz
        </p>
        <p>
          Tamara Yadao
        </p>
        <p>
          Danimal Cannon
        </p>
        <p>
          Jeff "jmr" Roberts
        </p>
        <p>
          Sam Agnew
        </p>

        <br/>

        <h3>{t('ui.credits.emeritus')}</h3>
        <p>
          <a href="https://twitter.com/ryrykubes">Ryan Kubik</a>
        </p>
        <p>
          <a href="https://twitter.com/dead_lugosi">Margaret Staples</a>
        </p>
        <p>
          <a href="https://twitter.com/CMassironi">Chiara Massironi</a>
        </p>
        <p>
          <a href="https://twitter.com/jna_sh">Joe Nash</a>
        </p>
        <p>
          <a href="https://twitter.com/craigsdennis">Craig Dennis</a>
        </p>
        <p>
          Nicole Adair
        </p>
        <p>
          Marvel Johnson
        </p>
        <p>
          <a href="https://twitter.com/dprothero">David Prothero</a>
        </p>
        <p>
          <a href="https://twitter.com/iamnirav">Nirav Sanghani</a>
        </p>

        <br/>

        <h3>{t('ui.credits.contributors')}</h3>

        <div className="fl w-50">
          <p>
            Mica Swyers
          </p>
          <p>
            Paul Kamp
          </p>
          <p>
            Kathryn King
          </p>
          <p>
            Christine Ledlie
          </p>
          <p>
            Carly Vanderwert
          </p>
          <p>
            Phil Nash
          </p>
          <p>&nbsp;</p>
        </div>


        <div className="fl w-50">
          <p>
            Ricky Holtz
          </p>
          <p>
            Andrew Baker
          </p>
          <p>
            Matt Makai
          </p>
          <p>
            Nathaniel Okenwa
          </p>
          <p>
            Chris Johnson
          </p>
          <p>
            Dominik Kundel
          </p>
          <p>&nbsp;</p>
        </div>

        <h3>{t('ui.credits.thanks')}</h3>

        <div className="fl w-50">
          <p>Kendra Whinnery</p>
          <p>Ricky Robinett</p>
          <p>Andrew Baker</p>
          <p>Rinat Shangeeta</p>
        </div>


        <div className="fl w-50">
          <p>Jeff Lawson</p>
          <p>Rob Spectre</p>
          <p>Eugene Kim</p>
          <p>&nbsp;</p>
        </div>

      </div>
    </div>
  );
}
