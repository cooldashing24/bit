import chai, { expect } from 'chai';
import { IssuesClasses } from '@teambit/component-issues';
import { statusFailureMsg } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('workspace config', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('overrides components', () => {
    // todo: check if needed.
    // on harmony, when both components in the workspace, it doesn't really override.
    describe.skip('changing component dependencies versions', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fs.createFile('foo', 'foo.js');
        helper.fs.createFile('bar', 'bar.js', "require('../foo/foo');");
        helper.command.addComponent('foo');
        helper.command.addComponent('bar');
        helper.command.linkAndRewire();
        helper.command.tagAllWithoutBuild();
        helper.command.tagIncludeUnmodified('2.0.0');
        const policy = {
          dependencies: {
            [`@${helper.scopes.remote}/foo`]: '0.0.1',
          },
        };
        helper.workspaceJsonc.setPolicyToVariant('bar', policy);
      });
      it('bit diff should show the tagged dependency version vs the version from overrides', () => {
        const diff = helper.command.diff('bar --verbose');
        expect(diff).to.have.string('- foo@2.0.0');
        expect(diff).to.have.string('+ foo@0.0.1');
      });
      it('should not duplicate the dependencies or add anything to the package dependencies', () => {
        const bar = helper.command.showComponentParsed('bar');
        expect(bar.dependencies).to.have.lengthOf(1);
        expect(Object.keys(bar.packageDependencies)).to.have.lengthOf(0);
      });
      describe('tagging the component', () => {
        before(() => {
          helper.command.tagAllWithoutBuild();
        });
        it('should save the overridden dependency version', () => {
          const bar = helper.command.catComponent('bar@latest');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(bar.dependencies[0].id.version).to.equal('0.0.1');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(bar.flattenedDependencies[0].version).to.equal('0.0.1');
        });
      });
    });
    describe('ignoring components dependencies', () => {
      let scopeAfterAdding;
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fs.createFile('foo1', 'foo1.js');
        helper.fs.createFile('foo2', 'foo2.js');
        helper.fs.createFile('bar', 'bar.js', "require('../foo1/foo1'); require('../foo2/foo2'); ");
        helper.command.addComponent('foo1', { i: 'utils/foo/foo1' });
        helper.command.addComponent('foo2', { i: 'utils/foo/foo2' });
        helper.command.addComponent('bar');
        helper.command.linkAndRewire();
        scopeAfterAdding = helper.scopeHelper.cloneWorkspace();
      });
      describe('ignoring a dependency component', () => {
        describe('when requiring with module path', () => {
          let showBar;
          before(() => {
            const policy = {
              dependencies: {
                [`@${helper.scopes.remote}/utils.foo.foo1`]: '-',
              },
            };
            helper.workspaceJsonc.setPolicyToVariant('bar', policy);
            showBar = helper.command.showComponentParsed('bar');
          });
          it('should not add the removed dependency to the component', () => {
            expect(showBar.dependencies).to.have.lengthOf(1);
            expect(showBar.dependencies[0].id).to.not.equal('foo1');
          });
        });
        // this test is irrelevant on Harmony, because the "+" is not supported.
        describe.skip('when adding the component as devDependency without removing it', () => {
          before(() => {
            helper.scopeHelper.getClonedWorkspace(scopeAfterAdding);
            const policy = {
              devDependencies: {
                [`@${helper.scopes.remote}/utils.foo.foo1`]: '+',
              },
            };
            helper.workspaceJsonc.setPolicyToVariant('bar', policy);
          });
          // todo: make a decision about the desired behavior. see #2061
          it.skip('should not show the component twice as dependency and as devDependencies', () => {
            const showBar = helper.command.showComponentParsed('bar');
            expect(showBar.dependencies).to.have.lengthOf(1);
          });
          it('should not allow tagging the component', () => {
            const tagFunc = () => helper.command.tagAllWithoutBuild();
            expect(tagFunc).to.throw('some dependencies are duplicated');
          });
        });
      });
    });
    describe('ignoring packages dependencies', () => {
      describe('ignoring a missing package', () => {
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.fs.createFile('bar', 'bar.js', "require('non-exist-package')");
          helper.command.addComponent('bar');
          helper.command.compile();

          // an intermediate step, make sure bit status shows the component with an issue of a missing file
          const status = helper.command.status();
          expect(status).to.have.string(statusFailureMsg);
          const policy = {
            dependencies: {
              'non-exist-package': '-',
            },
          };
          helper.workspaceJsonc.setPolicyToVariant('bar', policy);
        });
        it('bit status should not show the component as missing packages', () => {
          const status = helper.command.status();
          expect(status).to.not.have.string(statusFailureMsg);
        });
      });
      describe('ignoring an existing package', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.npm.addFakeNpmPackage('existing-package');
          helper.npm.addFakeNpmPackage('another-existing-package');
          helper.fs.createFile('bar', 'bar.js', "require('existing-package'); require('another-existing-package');");
          helper.command.addComponent('bar');

          const policy = {
            dependencies: {
              'existing-package': '-',
            },
          };
          helper.workspaceJsonc.setPolicyToVariant('bar', policy);
          showBar = helper.command.showComponentParsed('bar');
        });
        it('should ignore the specified package but keep other packages intact', () => {
          expect(Object.keys(showBar.packageDependencies)).to.have.lengthOf(1);
          expect(Object.keys(showBar.packageDependencies)[0]).to.equal('another-existing-package');
        });
        it('should show the package as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('existing-package');
        });
      });
      describe('ignoring an existing devDependency package', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.npm.addFakeNpmPackage('existing-package');
          helper.npm.addFakeNpmPackage('another-existing-package');
          helper.fs.createFile('bar', 'bar.js');
          helper.fs.createFile(
            'bar',
            'bar.spec.js',
            "require('existing-package'); require('another-existing-package');"
          );
          helper.command.addComponent('bar');
          const policy = {
            devDependencies: {
              'existing-package': '-',
            },
          };
          helper.workspaceJsonc.setPolicyToVariant('bar', policy);
          showBar = helper.command.showComponentParsed('bar');
        });
        it('should ignore the specified package but keep other packages intact', () => {
          expect(Object.keys(showBar.packageDependencies)).to.have.lengthOf(0);
          const devPackagesDependencies = Object.keys(showBar.devPackageDependencies);
          expect(devPackagesDependencies).to.include('another-existing-package');
          expect(devPackagesDependencies).to.not.include('existing-package');
        });
        it('should show the package as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('devDependencies');
          expect(showBar.manuallyRemovedDependencies.devDependencies).to.include('existing-package');
        });
        it('should not confuse ignore of dependencies with ignore of devDependencies', () => {
          expect(showBar.manuallyRemovedDependencies).to.not.have.property('dependencies');
        });
      });
      // @TODO: FIX. for some reason "chai" is still a peer package
      describe.skip('ignoring an existing peerDependency package', () => {
        let showBar;
        before(() => {
          // keep in mind that the 'chai' dependency is a regular package dependency, which
          // also saved as a peerDependency
          helper.scopeHelper.reInitWorkspace();
          helper.fixtures.createComponentBarFoo("import chai from 'chai';");
          helper.npm.addFakeNpmPackage('chai', '2.2.0');
          helper.packageJson.create({ peerDependencies: { chai: '>= 2.1.2 < 5' } });
          helper.fixtures.addComponentBarFoo();
          const policy = {
            peerDependencies: {
              chai: '-',
            },
          };
          helper.workspaceJsonc.setPolicyToVariant('bar', policy);
          showBar = helper.command.showComponentParsed('bar/foo');
        });
        it('should ignore the specified peer package', () => {
          expect(Object.keys(showBar.peerPackageDependencies)).to.have.lengthOf(0);
        });
        it('should keep the dependency package intact', () => {
          expect(Object.keys(showBar.packageDependencies)).to.have.lengthOf(1);
        });
        it('should show the package as ignored', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('peerDependencies');
          expect(showBar.manuallyRemovedDependencies.peerDependencies).to.include('chai');
        });
        it('should not confuse ignore of dependencies/devDependencies with ignore of peerDependencies', () => {
          expect(showBar.manuallyRemovedDependencies).to.not.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies).to.not.have.property('devDependencies');
        });
      });
    });
    describe('ignoring dependencies components entire flow', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fs.createFile('foo1', 'foo1.js');
        helper.fs.createFile('foo2', 'foo2.js');
        helper.fs.createFile('bar', 'bar.js', "require('../foo1/foo1'); require('../foo2/foo2'); ");
        helper.command.addComponent('foo1', { i: 'utils/foo/foo1' });
        helper.command.addComponent('foo2', { i: 'utils/foo/foo2' });
        helper.command.addComponent('bar');
        helper.command.linkAndRewire();
        helper.command.tagAllWithoutBuild();
        helper.command.export();
        const policy = {
          dependencies: {
            [`@${helper.scopes.remote}/utils.foo.foo2`]: '-',
          },
        };
        helper.workspaceJsonc.setPolicyToVariant('bar', policy);
      });
      describe('tagging the component', () => {
        let output;
        let catBar;
        before(() => {
          output = helper.command.tagWithoutBuild('bar');
          catBar = helper.command.catComponent('bar@latest');
        });
        it('should be able to tag successfully', () => {
          expect(output).to.have.string('1 component(s) tagged');
        });
        it('should remove the dependency from the model', () => {
          expect(catBar.dependencies).to.have.lengthOf(1);
        });
        it('should save the overrides data into the model', () => {
          expect(catBar).to.have.property('overrides');
          expect(catBar.overrides).to.have.property('dependencies');
          expect(catBar.overrides.dependencies).to.have.property(`@${helper.scopes.remote}/utils.foo.foo2`);
          expect(catBar.overrides.dependencies[`@${helper.scopes.remote}/utils.foo.foo2`]).to.equal('-');
        });
        it('should not show the component as modified', () => {
          const status = helper.command.status();
          expect(status).to.not.have.string('modified components');
        });
        describe('importing the component', () => {
          before(() => {
            helper.command.export();
            helper.scopeHelper.reInitWorkspace();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('*');
          });
          it('bit status should not show the component as modified', () => {
            helper.command.expectStatusToBeClean();
          });
          it('bit diff should not show any diff', () => {
            const diff = helper.command.diff('bar');
            expect(diff).to.have.string('no diff');
          });
          describe('changing the imported component to not ignore the dependency', () => {
            before(() => {
              helper.command.ejectConf('bar');
              helper.componentJson.removeExtension(
                'teambit.dependencies/dependency-resolver',
                `${helper.scopes.remote}/bar`
              );
            });
            it('bit status should show the component as modified', () => {
              const status = helper.command.status();
              expect(status).to.have.string('modified components');
            });
            it('bit diff should show the overrides differences', () => {
              const diff = helper.command.diff('bar --verbose');
              expect(diff).to.have.string('--- Overrides Dependencies (0.0.2 original)');
              expect(diff).to.have.string('+++ Overrides Dependencies (0.0.2 modified)');
              expect(diff).to.have.string(`- [ @${helper.scopes.remote}/utils.foo.foo2@-`);
            });
          });
        });
      });
    });
    describe('manually adding dependencies', () => {
      describe('moving a package from dependencies to peerDependencies', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.fixtures.createComponentBarFoo("import chai from 'chai';");
          helper.npm.addFakeNpmPackage('chai', '2.2.0');
          helper.packageJson.create({ dependencies: { chai: '2.2.0' } });
          helper.fixtures.addComponentBarFoo();
          const policy = {
            dependencies: {
              chai: '-',
            },
            peerDependencies: {
              chai: '+',
            },
          };
          helper.workspaceJsonc.setPolicyToVariant('bar', policy);
          showBar = helper.command.showComponentParsed('bar/foo');
        });
        it('should ignore the specified package from dependencies', () => {
          expect(Object.keys(showBar.packageDependencies)).to.have.lengthOf(0);
        });
        it('should add the specified package to peerDependencies', () => {
          expect(Object.keys(showBar.peerPackageDependencies)).to.have.lengthOf(1);
          expect(showBar.peerPackageDependencies).to.deep.equal({ chai: '2.2.0' });
        });
        it('should show the package as ignored from dependencies', () => {
          expect(showBar).to.have.property('manuallyRemovedDependencies');
          expect(showBar.manuallyRemovedDependencies).to.have.property('dependencies');
          expect(showBar.manuallyRemovedDependencies.dependencies).to.include('chai');
        });
        it('should show the package as manually added to peerDependencies', () => {
          expect(showBar).to.have.property('manuallyAddedDependencies');
          expect(showBar.manuallyAddedDependencies).to.have.property('peerDependencies');
          expect(showBar.manuallyAddedDependencies.peerDependencies).to.deep.equal(['chai@2.2.0']);
        });
      });
      describe('adding a package with version that does not exist in package.json', () => {
        let showBar;
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.fixtures.createComponentBarFoo("import chai from 'chai';");
          helper.fixtures.addComponentBarFoo();
          const policy = {
            peerDependencies: {
              chai: '2.2.0',
            },
          };
          helper.workspaceJsonc.setPolicyToVariant('bar', policy);
          showBar = helper.command.showComponentParsed('bar/foo');
        });
        it('should add the specified package to peerDependencies', () => {
          expect(Object.keys(showBar.peerPackageDependencies)).to.have.lengthOf(1);
          expect(showBar.peerPackageDependencies).to.deep.equal({ chai: '2.2.0' });
        });
        it('should show the package as manually added to peerDependencies', () => {
          expect(showBar).to.have.property('manuallyAddedDependencies');
          expect(showBar.manuallyAddedDependencies).to.have.property('peerDependencies');
          expect(showBar.manuallyAddedDependencies.peerDependencies).to.deep.equal(['chai@2.2.0']);
        });
      });
      describe('adding a package without version that does not exist in package.json', () => {
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.fixtures.createComponentBarFoo("import chai from 'chai';");
          helper.fixtures.addComponentBarFoo();
          const policy = {
            peerDependencies: {
              chai: '+',
            },
          };
          helper.workspaceJsonc.setPolicyToVariant('bar', policy);
        });
        // See similar test in show.e2e - component with overrides data
        it('should not show the package in dependencies', () => {
          const output = helper.command.showComponent('bar/foo');
          expect(output).to.not.have.string('chai"');
        });
        // See similar test in status.e2e - when a component is created and added without its package dependencies
        it('should show a missing package in status', () => {
          const output = helper.command.status().replace(/\n/g, '');
          helper.command.expectStatusToHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
          expect(output).to.have.string('foo.js -> chai');
        });
      });
    });
  });
});
