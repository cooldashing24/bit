import chai, { expect } from 'chai';
import { isEmpty } from 'lodash';

import { AlreadyExistsError } from '../../scopes/workspace/workspace/component-config-file/exceptions';
import { Helper, GeneralHelper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('component config', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('eject config', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
    });
    describe('eject for new component', () => {
      let output;
      let alignedOutput;
      let componentJsonPath;
      before(() => {
        output = helper.command.ejectConf('bar/foo');
        componentJsonPath = helper.componentJson.composePath('bar');
      });
      it('expect to output the path of the config', () => {
        alignedOutput = GeneralHelper.alignOutput(output);
        const compJsonRelative = helper.componentJson.composePath('bar', false);
        expect(alignedOutput).to.have.string(compJsonRelative);
      });
      it('expect to write a component json file', () => {
        expect(componentJsonPath).to.be.a.file();
      });
      describe('component json content', () => {
        let componentJson;
        before(() => {
          componentJson = helper.componentJson.read('bar');
        });
        it('expect to have the component id', () => {
          expect(componentJson.componentId).to.deep.equal({
            scope: 'my-scope',
            name: 'bar/foo',
          });
        });
        it('expect to have the propagate false by default', () => {
          expect(componentJson.propagate).to.be.false;
        });
        it('expect to write a component json with no extensions', () => {
          expect(componentJson.extensions).to.be.empty;
        });
      });
      describe('using propagate true flag', () => {
        let componentJson;
        before(() => {
          // Clean from previous test (faster then re-create the entire scope)
          helper.componentJson.deleteIfExist();
          output = helper.command.ejectConf('bar/foo', { propagate: true });
          componentJson = helper.componentJson.read('bar');
        });
        it('expect to have the propagate true', () => {
          expect(componentJson.propagate).to.be.true;
        });
      });
      describe('when file already existing', () => {
        before(() => {
          // Clean from previous test (faster then re-create the entire scope)
          helper.componentJson.deleteIfExist();
          output = helper.command.ejectConf('bar/foo');
        });
        it('should throw error if override not used', () => {
          componentJsonPath = helper.componentJson.composePath('bar', false);
          const ejectCmd = () => helper.command.ejectConf('bar/foo');
          const error = new AlreadyExistsError(componentJsonPath);
          helper.general.expectToThrow(ejectCmd, error);
        });
        it('should success if override used', () => {
          expect(() => helper.command.ejectConf('bar/foo', { override: '' })).not.to.throw();
        });
      });
      describe('when there are variant extensions defined', () => {
        let componentJson;
        const config = { key: 'val' };
        before(() => {
          helper.componentJson.deleteIfExist('bar');
          helper.fixtures.copyFixtureExtensions('dummy-extension');
          helper.command.addComponent('dummy-extension');
          helper.extensions.addExtensionToVariant('bar', 'default-scope/dummy-extension', config);
          helper.command.ejectConf('bar/foo');
          componentJson = helper.componentJson.read('bar');
        });
        it('should not have extensions from models in component.json', () => {
          expect(componentJson.extensions).to.be.empty;
        });
      });
    });
    describe('eject for tagged component', () => {
      let componentJson;
      const config = { key: 'val' };
      before(() => {
        const EXTENSION_FOLDER = 'dummy-extension';
        helper.componentJson.deleteIfExist('bar');
        helper.fixtures.copyFixtureExtensions(EXTENSION_FOLDER);
        helper.command.addComponent(EXTENSION_FOLDER);
        helper.extensions.addExtensionToVariant('bar', 'my-scope/dummy-extension', config, true);
        helper.extensions.addExtensionToVariant(EXTENSION_FOLDER, 'teambit.harmony/aspect');
        helper.command.install();
        helper.command.compile();
        helper.command.tagAllComponents();
        helper.command.ejectConf('bar/foo');
        componentJson = helper.componentJson.read('bar');
      });
      it('should have extensions from models in component.json', () => {
        expect(componentJson.extensions).to.have.property('my-scope/dummy-extension@0.0.1');
        expect(componentJson.extensions['my-scope/dummy-extension@0.0.1']).to.deep.equal(config);
      });
    });
  });
  describe('import --conf', () => {});
  describe('creating a capsule', () => {
    // Make sure the component.json is written into capsule
  });
  const getExtensions = (extensions) => {
    return extensions
      .filter((extEntry) => {
        return !isEmpty(extEntry.config);
      })
      .map((extEntry) => {
        delete extEntry.config.__specific;
        return extEntry;
      });
  };
  describe('propagation', () => {
    let output;
    let configuredExtensions;
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.fixtures.populateExtensions(5);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.extensions.addExtensionToVariant('*', 'my-scope/ext1', { key: 'val-ws-defaults' });
      helper.extensions.addExtensionToVariant('*', 'my-scope/ext2', { key: 'val-ws-defaults' });
      helper.extensions.addExtensionToVariant('*', 'my-scope/ext5', { key: 'val-ws-defaults' });
      helper.extensions.addExtensionToVariant('extensions', 'teambit.harmony/aspect');
      helper.workspaceJsonc.addToVariant('extensions', 'propagate', false);
      helper.command.install();
      helper.command.compile();
      helper.extensions.addExtensionToVariant('bar', 'my-scope/ext2', { key: 'val-variant' });
      helper.extensions.addExtensionToVariant('bar', 'my-scope/ext3', { key: 'val-variant' });
      helper.extensions.addExtensionToVariant('bar', 'my-scope/ext4', { key: 'val-variant' });
      helper.command.ejectConf('bar/foo');
      helper.componentJson.setExtension('my-scope/ext4', { key: 'val-component-json' });
      helper.componentJson.setExtension('my-scope/ext5', { key: 'val-component-json' });
    });
    describe('stop on component.json - component.json propagate false', () => {
      before(() => {
        helper.componentJson.setPropagate(false);
        output = helper.command.showComponentParsed('bar/foo');
        configuredExtensions = getExtensions(output.extensions);
      });
      it('should only has extensions defined in component.json', () => {
        expect(configuredExtensions).to.be.length(2);
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext4', { key: 'val-component-json' }));
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext5', { key: 'val-component-json' }));
      });
    });
    describe('stop on variant - component.json propagate true and variant propagate false', () => {
      before(() => {
        helper.componentJson.setPropagate(true);
        helper.workspaceJsonc.addToVariant('bar', 'propagate', false);
        output = helper.command.showComponentParsed('bar/foo');
        configuredExtensions = getExtensions(output.extensions);
      });
      it('should not contain extension from workspace defaults', () => {
        expect(configuredExtensions).to.be.length(4);
      });
      it('should prefer config from component json when there is conflict', () => {
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext4', { key: 'val-component-json' }));
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext5', { key: 'val-component-json' }));
      });
      it('should has extensions from the variant', () => {
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext2', { key: 'val-variant' }));
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext3', { key: 'val-variant' }));
      });
    });
    describe('propagate all the way - component.json propagate true and variant propagate true', () => {
      before(() => {
        helper.componentJson.setPropagate(true);
        helper.workspaceJsonc.addToVariant('bar', 'propagate', true);
        output = helper.command.showComponentParsed('bar/foo');
        configuredExtensions = getExtensions(output.extensions);
      });
      it('should contain extension from all sources', () => {
        expect(configuredExtensions).to.be.length(5);
      });
      it('should prefer config from component json when there is conflicts with variant or with workspace defaults', () => {
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext4', { key: 'val-component-json' }));
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext5', { key: 'val-component-json' }));
      });
      it('should prefer config from variant when there is conflicts with workspace defaults', () => {
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext2', { key: 'val-variant' }));
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext3', { key: 'val-variant' }));
      });
      it('should has extensions from the workspace defaults', () => {
        expect(configuredExtensions).to.deep.include(getExtensionEntry('ext1', { key: 'val-ws-defaults' }));
      });
    });
    // TODO: implement once vendor is implemented
    describe.skip('vendor component', () => {
      it('', () => {});
    });
  });
});

function getExtensionEntry(extensionName: string, config: any): any {
  return {
    extensionId: `my-scope/${extensionName}`,
    config,
    newExtensionId: {
      _legacy: {
        scope: null,
        name: extensionName,
        version: 'latest',
      },
      _scope: 'my-scope',
    },
    data: {},
  };
}
