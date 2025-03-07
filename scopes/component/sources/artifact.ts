import AbstractVinyl from './abstract-vinyl';

export class ArtifactVinyl extends AbstractVinyl {
  url?: string;
  constructor(opts) {
    super(opts);
    if (opts.url) {
      this.url = opts.url;
    }
  }
}
