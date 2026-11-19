const path = require('path');

module.exports = async helper => {
  const { repositoryFilePath } = helper.validationFields;

  if (!repositoryFilePath) {
    helper.fail(helper.t("missingPath", "Don't forget to provide a repository file path!"));
    return;
  }

  try {
    const directoryExists = await helper.fs.existsAsync(repositoryFilePath);

    if (directoryExists !== 'dir') {
      helper.fail(
        helper.t(
          "notDirectory",
          "We could not find a directory at the path you provided! -> {{repositoryFilePath}}",
          { repositoryFilePath }
        )
      );
      return;
    }

    const packagePath = path.join(repositoryFilePath, 'package.json');
    const packageFileExists = await helper.fs.existsAsync(packagePath);

    if (packageFileExists !== 'file') {
      helper.fail(
        helper.t(
          "missingPackage",
          "We could not find the package file in your provided repository! Was it cloned correctly? -> {{packagePath}}",
          { packagePath }
        )
      );
      return;
    }

    const packageContents = await helper.fs.readAsync(packagePath, 'json');

    if (packageContents.name !== 'open-pixel-art') {
      helper.fail(
        helper.t(
          "wrongPackage",
          "The package file in that repository was not for the correct project! Was it cloned correctly? -> {{packagePath}}",
          { packagePath }
        )
      );
      return;
    }

    helper.success(
      helper.t("cloned", "It looks like you've cloned the Open Pixel Art repository correctly!"),
      [{ name: 'OPEN_PIXEL_ART_DIR', value: repositoryFilePath }]
    );
  } catch (err) {
    helper.fail(helper.t("error", `Something went wrong while we were trying to validate your repository clone!
    
    {{err}}`, { err }));
  }
};
