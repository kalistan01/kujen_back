module.exports = {
  // 2XX success

  success: (res, data, msg) => {
    return res.status(200).json({
      message: msg ?? "Data retrieved successfully.",
      success: true,
      data: data ?? undefined,
    });
  },
  created: (res, data, msg) => {
    return res.status(201).json({
      message: msg ?? "New resource was created",
      success: true,
      data: data ?? undefined,
    });
  },
  accepted: (res, msg) => {
    return res.status(202).json({
      message: msg ?? "Accepted but not yet processed",
      success: true,
    });
  },
    noContent: (res, msg) => {
    return res.status(204).json({
      message: msg ?? "Successful, but no content is being returned",
      success: true,
    });
  },
  // 4xx errors

  badRequest: (res, error) => {
    return res.status(400).json({
      success: false,
      message: "Invalid request syntax or parameters",
      error:
        process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
    });
  },
  unauthorized: (res, error) => {
    return res.status(401).json({
      success: false,
      message: "Access Denied! Unauthorized request",
      error:
        process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
    });
  },
  forbidden: (res, error) => {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to access this resource",
      error:
        process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
    });
  },
  notFound: (res, error) => {
    return res.status(404).json({
      success: false,
      message: "The requested resource was not found",
      error:
        process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
    });
  },
  methodNotAllowed: (res, error) => {
    return res.status(405).json({
      success: false,
      message: "The HTTP method used is not supported for the resource",
      error:
        process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
    });
  },
  conflict: (res, error) => {
    return res.status(409).json({
      success: false,
      message: process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
      error:"This entry already found.",
        
    });
  },
  //   sequelizeConflict: (res, error) => {
  //     if (error.name === "SequelizeUniqueConstraintError") {
  //       return res.status(409).json({
  //         success: false,
  //         message: "this entry already found.",
  //         error: process.env.NODE_ENV !== "production" ? error ?? undefined  : undefined,
  //       });
  //     }
  //   },
  unprocessableEntity: (res, error) => {
    return res.status(422).json({
      success: false,
      message: "Invalid data provided",
      error:
        process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
    });
  },
  tooManyRequests: (res, error) => {
    return res.status(429).json({
      success: false,
      message: "The client has sent too many requests ",
      error:
        process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
    });
  },
  internalServerError: (res, error) => {
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
      error:
        process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
    });
  },

  error400409500: (res, error) => {
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        error:
          process.env.NODE_ENV !== "production"
            ? error.errors.map((err) => err.message)[0]
            : undefined,
      });
    } else if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "This entry already found.",
        error:
          process.env.NODE_ENV !== "production"
            ? error.errors.map((err) => err.message)[0]
            : undefined,
      });
    }

    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
      error:
        process.env.NODE_ENV !== "production" ? error ?? undefined : undefined,
    });
  },
  error400500: (res, error) => {
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        error:
          process.env.NODE_ENV !== "production"
            ? error.errors.map((err) => err.message)[0]
            : undefined,
      });
    }

    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
      error: process.env.NODE_ENV !== "production" ? error : undefined,
    });
  },
};
