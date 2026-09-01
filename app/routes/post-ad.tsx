import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/post-ad";
import { saveAd, CATEGORIES, type Ad } from "../utils/db";
import { isAuthenticated } from "../utils/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Post Free Ad – FreeAdsPost" },
    { name: "description", content: "Post your free classified ad on FreeAdsPost. No registration needed." },
  ];
}

export default function PostAd() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login?redirectTo=/post-ad", { replace: true });
    }
  }, [navigate]);

  if (!isAuthenticated()) {
    return null; // Prevents flashing the form while redirecting
  }

  // Form Field States
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("new");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState("fixed");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [image, setImage] = useState("");

  // Validation Error States
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [imagePreviewValid, setImagePreviewValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReset = () => {
    setTitle("");
    setCategory("");
    setCondition("new");
    setDescription("");
    setPrice("");
    setPriceType("fixed");
    setCity("");
    setState("");
    setImage("");
    setErrors({});
    setImagePreviewValid(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = "Title is required.";
    if (!category) newErrors.category = "Please select a category.";
    if (!description.trim() || description.trim().length < 20) {
      newErrors.description = "Description must be at least 20 characters.";
    }
    if (!city.trim()) newErrors.city = "City is required.";
    

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const savedAd = await saveAd({
      title: title.trim(),
      category,
      condition,
      description: description.trim(),
      price: price || "0",
      priceType,
      city: city.trim(),
      state: state.trim(),
      image: image.trim(),
    });

    setIsSubmitting(false);

    if (savedAd) {
      setShowSuccessModal(true);
      handleReset();
    } else {
      setErrors({ form: "Could not post ad to the server. Please try again." });
    }
  };

  return (
    <>
      <section className="page-hero">
        <div className="hero-bg-glow glow1"></div>
        <div className="container">
          <div className="page-hero-text">
            <h1>
              Post Your <span className="gradient-text">Free Ad</span>
            </h1>
            <p>Fill in the details below. Your ad goes live instantly!</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="form-layout">
            {/* FORM */}
            <div className="post-form-card">
              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <label htmlFor="adTitle">Ad Title *</label>
                  <input
                    type="text"
                    id="adTitle"
                    placeholder="e.g. iPhone 14 Pro Max 256GB Black"
                    maxLength={100}
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (errors.title) setErrors((prev) => ({ ...prev, title: "" }));
                    }}
                  />
                  <span className="char-count" id="titleCount">
                    {title.length}/100
                  </span>
                  <span className="field-error">{errors.title}</span>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="adCategory">Category *</label>
                    <select
                      id="adCategory"
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        if (errors.category) setErrors((prev) => ({ ...prev, category: "" }));
                      }}
                    >
                      <option value="">Select a Category</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat.slug} value={cat.slug}>
                          {cat.icon} {cat.label}
                        </option>
                      ))}
                    </select>
                    <span className="field-error">{errors.category}</span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="adCondition">Condition</label>
                    <select
                      id="adCondition"
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                    >
                      <option value="new">New</option>
                      <option value="like-new">Like New</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="not-applicable">Not Applicable</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="adDescription">Description *</label>
                  <textarea
                    id="adDescription"
                    rows={5}
                    placeholder="Describe your item or service in detail. Include brand, model, size, color, features, reason for selling..."
                    maxLength={1000}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (errors.description) setErrors((prev) => ({ ...prev, description: "" }));
                    }}
                  />
                  <span className="char-count" id="descCount">
                    {description.length}/1000
                  </span>
                  <span className="field-error">{errors.description}</span>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="adPrice">Price (₹)</label>
                    <input
                      type="number"
                      id="adPrice"
                      placeholder="0 for Free"
                      min="0"
                      value={price}
                      disabled={priceType === "free" || priceType === "contact"}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="adPriceType">Price Type</label>
                    <select
                      id="adPriceType"
                      value={priceType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPriceType(val);
                        if (val === "free" || val === "contact") {
                          setPrice("");
                        }
                      }}
                    >
                      <option value="fixed">Fixed</option>
                      <option value="negotiable">Negotiable</option>
                      <option value="free">Free</option>
                      <option value="contact">Contact for Price</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="adCity">City *</label>
                    <input
                      type="text"
                      id="adCity"
                      placeholder="e.g. Mumbai"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        if (errors.city) setErrors((prev) => ({ ...prev, city: "" }));
                      }}
                    />
                    <span className="field-error">{errors.city}</span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="adState">State</label>
                    <input
                      type="text"
                      id="adState"
                      placeholder="e.g. Maharashtra"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                  </div>
                </div>


                <div className="form-group">
                  <label>Ad Image (URL)</label>
                  <input
                    type="url"
                    id="adImage"
                    placeholder="https://example.com/image.jpg (optional)"
                    value={image}
                    onChange={(e) => {
                      const val = e.target.value;
                      setImage(val);
                      setImagePreviewValid(!!val);
                    }}
                  />
                  {image && imagePreviewValid && (
                    <div className="img-preview-wrap">
                      <img
                        src={image}
                        alt="Preview"
                        onError={() => setImagePreviewValid(false)}
                      />
                    </div>
                  )}
                </div>

                {errors.form && (
                  <div className="field-error" style={{ marginBottom: "15px", textAlign: "center" }}>
                    {errors.form}
                  </div>
                )}

                <div className="form-actions">
                  <button type="button" onClick={handleReset} className="btn btn-outline" disabled={isSubmitting}>
                    Clear Form
                  </button>
                  <button type="submit" className="btn btn-primary btn-lg" disabled={isSubmitting}>
                    <span>{isSubmitting ? "⏳ Posting Ad..." : "🚀 Post Ad Now"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* TIPS */}
            <aside className="tips-panel">
              <h3>💡 Tips for a Great Ad</h3>
              <ul>
                <li>✅ Use a clear, specific title</li>
                <li>✅ Add all important details in description</li>
                <li>✅ Mention brand, model, size, color</li>
                <li>✅ Set a realistic price</li>
                <li>✅ Add a photo for more responses</li>
                <li>✅ Include your city for local reach</li>
                <li>❌ Don't share passwords or OTPs</li>
                <li>❌ Don't pay in advance to strangers</li>
              </ul>
              <div className="tips-cta">
                <p>🔒 Your ad is linked to your seller account and can be shown while you are available to respond.</p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* SUCCESS MODAL */}
      {showSuccessModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSuccessModal(false);
          }}
        >
          <div className="modal-card">
            <div className="modal-icon">🎉</div>
            <h2>Ad Posted Successfully!</h2>
            <p>Your ad is now live and visible to all visitors.</p>
            <div className="modal-actions">
              <Link to="/browse" className="btn btn-outline">
                Browse All Ads
              </Link>
              <button
                className="btn btn-primary"
                onClick={() => setShowSuccessModal(false)}
              >
                Post Another
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
